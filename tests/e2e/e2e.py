"""End-to-end test against scripts/dev-mock-server.mjs (real UI, real API/vault/CSP code, fake sign-in).
Run:  python3 tests/e2e/e2e.py      (starts and stops its own server on port 3199)
Needs: python playwright + a chromium (set CHROMIUM_PATH if not at /opt/pw-browsers/chromium)."""
import asyncio, json, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 3199
BASE = f'http://127.0.0.1:{PORT}'
FIX = os.path.join(ROOT, 'tests', 'e2e', 'fixtures')
IGNORE = ('fonts.googleapis', 'fonts.gstatic', 'ERR_TUNNEL', 'ERR_NAME_NOT_RESOLVED', 'ERR_INTERNET_DISCONNECTED')
fails = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))
    if not cond: fails.append(name)

def state():
    with urllib.request.urlopen(BASE + '/__test/state') as r: return json.load(r)

async def open_panel(pg):
    if await pg.get_attribute('#tracker-add-btn', 'aria-pressed') != 'true': await pg.click('#tracker-add-btn')
    await pg.wait_for_timeout(250)

async def login(ctx, email):
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(x in m.text for x in IGNORE) else None)
    pg.on('response', lambda r: errs.append('HTTP %s %s' % (r.status, r.url)) if r.status >= 400 and r.url.startswith(BASE) else None)
    await pg.goto(BASE + '/login'); await pg.fill('input[name=email]', email); await pg.click('button')
    return pg, errs

async def main():
    env = dict(os.environ, PORT=str(PORT), APP_ORIGIN=BASE, ADMIN_EMAILS='admin@example.com', MOCK_TEST_ENDPOINTS='1', DAILY_READ_CAP='4')
    srv = subprocess.Popen(['node', 'scripts/dev-mock-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(BASE + '/login'); break
            except Exception: time.sleep(0.1)
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
            admin_ctx = await b.new_context(viewport={'width': 1300, 'height': 900}); ann_ctx = await b.new_context(viewport={'width': 1300, 'height': 900})

            # 1. admin: page loads with an empty account and no script/CSP errors
            pg, errs = await login(admin_ctx, 'admin@example.com')
            await pg.wait_for_selector('.ct-shell'); await pg.wait_for_timeout(700)
            check('admin: tracker renders, no page or CSP errors', not errs, errs)
            check('admin: current year auto-created', await pg.locator('.year-btn').count() >= 1)

            # 2. manual entry persists across reload; storage holds ciphertext only
            await open_panel(pg)
            await pg.fill('#entry-desc', 'ZZTOP-PLAINTEXT-MARKER')
            await pg.select_option('#entry-category', 'Habitation'); await pg.select_option('#entry-item', 'Rent or mortgage')
            await pg.fill('#entry-amount', '777.5'); await pg.click('#entry-submit'); await pg.wait_for_timeout(600)
            st = state()
            check('manual entry stored (1 entries row)', len([r for r in st['rows'] if r['collection'] == 'entries']) == 1)
            check('no plaintext in stored rows', 'ZZTOP' not in json.dumps(st['rows']) and '777' not in json.dumps(st['rows']))
            await pg.reload(); await pg.wait_for_selector('.ct-shell'); await pg.wait_for_timeout(700)
            body = await pg.inner_text('body')
            check('entry visible after reload (decrypted, totals updated)', '777,50' in body)

            # 3. CSV reading via the server-side reader
            await open_panel(pg)
            check('upload dropzone enabled', not await pg.evaluate("document.getElementById('dropzone').classList.contains('is-off')"))
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'statement.csv')]); await pg.wait_for_timeout(300)
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('CSV: review shows a row from the AI reply', await pg.locator('.rv-row').count() == 1)
            await pg.click('#rv-submit'); await pg.wait_for_timeout(700)
            check('reviewed row saved as second entry', len([r for r in state()['rows'] if r['collection'] == 'entries']) == 2)
            check('AI got text only for CSV', state()['aiCalls'][-1]['images'] == 0 and 'FAKE SUPERMARKET' in state()['aiCalls'][-1]['prompt'], state()['aiCalls'][-1])

            # 4. photo reading sends an image
            await open_panel(pg)
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'receipt.png')]); await pg.wait_for_timeout(500)
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('photo: image sent to the reader', state()['aiCalls'][-1]['images'] == 1, state()['aiCalls'][-1])
            await pg.keyboard.press('Escape')

            # 5. CSP blocks injected inline handlers; CSRF guard refuses cross-site writes
            await pg.evaluate("document.body.insertAdjacentHTML('beforeend','<img src=x onerror=\"window.__pwned=1\">')"); await pg.wait_for_timeout(300)
            check('CSP: injected onerror handler did not run', await pg.evaluate('window.__pwned') is None)
            r = await admin_ctx.request.post(BASE + '/api/db/entries', data={'a': 1}, headers={'origin': 'https://evil.test', 'x-requested-with': 'costs-tracker'})
            check('CSRF: cross-origin write refused', r.status == 403)
            r = await admin_ctx.request.post(BASE + '/api/db/entries', data={'a': 1})
            check('CSRF: write without custom header refused', r.status == 403)
            r = await b.new_context()
            resp = await r.request.get(BASE + '/api/db/entries'); check('anonymous API call -> 401', resp.status == 401); await r.close()

            # 6. second user is pending, then approved, and sees none of the admin's data
            ann, aerrs = await login(ann_ctx, 'ann@example.com'); await ann.wait_for_url('**/pending', timeout=5000)
            check('new user lands on the pending page', ann.url.endswith('/pending'))
            resp = await ann_ctx.request.get(BASE + '/api/db/entries'); check('pending user API -> 403', resp.status == 403)
            await pg.keyboard.press('Escape'); await pg.evaluate("(document.querySelector('#add-panel.open .add-panel-close, #add-panel.open [aria-label*=lose]')||{click(){}}).click()"); await pg.wait_for_timeout(300)
            await pg.click('text=Approve users'); await pg.wait_for_selector('dialog.ct-dialog[open]')
            await pg.locator('.ct-row', has_text='ann@example.com').get_by_text('Approve', exact=True).click(); await pg.wait_for_timeout(400)
            await ann.goto(BASE + '/'); await ann.wait_for_selector('.ct-shell'); await ann.wait_for_timeout(700)
            abody = await ann.inner_text('body')
            check('approved user sees an empty account (isolation)', '777,50' not in abody and '23,40' not in abody)
            check('approved user: no errors', not aerrs, aerrs)
            resp = await ann_ctx.request.get(BASE + '/api/admin/users'); check('non-admin cannot list users', resp.status == 403)
            check('two users -> two wrapped keys', len(state()['keys']) == 2)

            # 6b. ids containing . : @ + ~ (as the app's own budget-default ids do) survive the round trip
            odd = 'budgetDefaults__expense__Fixed__Rent.v1~a:b@c+d'
            await pg.evaluate("async (id) => { const db = await window.claude.use('db'); await db.doc('budgetDefaults/' + id).set({ amount: 5 }); }", odd)
            got = await pg.evaluate("fetch('/api/db/budgetDefaults').then(r => r.json())")
            check('odd doc id stored and returned unchanged', [d['id'] for d in got['docs']] == [odd], got)

            # 7. daily cap (4): admin already used 2 reads
            await pg.reload(); await pg.wait_for_selector('.ct-shell')
            codes = []
            for _ in range(4):
                rr = await admin_ctx.request.post(BASE + '/api/read-document', data={'prompt': 'x'}, headers={'origin': BASE, 'x-requested-with': 'costs-tracker'}); codes.append(rr.status)
            check('daily read cap enforced', codes == [200, 200, 429, 429], codes)

            # 8. erase my data, then sign out
            await ann.click('text=Delete all my data'); await ann.click('text=Click again to permanently delete'); await ann.wait_for_url('**/login', timeout=5000)
            check('erase: key and rows removed for that user', len(state()['keys']) == 1)
            await pg.click('text=Sign out'); await pg.wait_for_url('**/login', timeout=5000)
            check('sign-out returns to login', True)
            await b.close()
    finally:
        srv.terminate()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
asyncio.run(main())
