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

async def dd_structure(pg, sid):
    """Open the dropdown behind <select id=sid>, read its menu as [(group|None, [items])], close it."""
    await pg.click(f'#{sid}-trigger'); await pg.wait_for_selector('.ds-dd-menu')
    out = await pg.evaluate("""() => [...document.querySelectorAll('.ds-dd-menu .ds-dd-block')].map(b => {
        const g = b.querySelector('.ds-dd-group'); return [g ? g.textContent : null, [...b.querySelectorAll('.ds-dd-item')].map(i => i.textContent)]; })""")
    await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
    return out

async def dd_pick(pg, sid, text, group=None):
    await pg.click(f'#{sid}-trigger'); await pg.wait_for_selector('.ds-dd-menu')
    scope = f'.ds-dd-block:has(.ds-dd-group:text-is("{group}")) ' if group else ''
    await pg.click(f'.ds-dd-menu {scope}.ds-dd-item:text-is("{text}")'); await pg.wait_for_timeout(120)

async def dd_text(pg, sid): return await pg.inner_text(f'#{sid}-trigger')

async def login(ctx, email):
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(x in m.text for x in IGNORE) else None)
    pg.on('response', lambda r: errs.append('HTTP %s %s' % (r.status, r.url)) if r.status >= 400 and r.url.startswith(BASE) else None)
    await pg.goto(BASE + '/login'); await pg.fill('input[name=email]', email); await pg.click('button')
    return pg, errs

async def main():
    env = dict(os.environ, PORT=str(PORT), APP_ORIGIN=BASE, ADMIN_EMAILS='admin@example.com', MOCK_TEST_ENDPOINTS='1', DAILY_READ_CAP='5')
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
            await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            check('admin: tracker renders, no page or CSP errors', not errs, errs)
            check('admin: current year auto-created', await pg.locator('.year-btn').count() >= 1)

            # 2. manual entry persists across reload; storage holds ciphertext only
            await open_panel(pg)
            await pg.fill('#entry-desc', 'ZZTOP-PLAINTEXT-MARKER')
            await dd_pick(pg, 'entry-cat', 'Habitation')
            n_items = await pg.evaluate("document.querySelectorAll('#entry-item option[value]:not([value=\"\"])').length")
            check('a category with several sub-categories selects none by itself', n_items > 1 and await pg.eval_on_selector('#entry-item', 'e => e.value') == '', n_items)
            await dd_pick(pg, 'entry-item', 'Rent or mortgage')
            await pg.fill('#entry-amount', '777.5'); await pg.click('#entry-submit'); await pg.wait_for_timeout(600)
            st = state()
            check('manual entry stored (1 entries row)', len([r for r in st['rows'] if r['collection'] == 'entries']) == 1)
            check('no plaintext in stored rows', 'ZZTOP' not in json.dumps(st['rows']) and '777' not in json.dumps(st['rows']))
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            body = await pg.inner_text('body')
            check('entry visible after reload (decrypted, totals updated)', '777,50' in body)

            # 2b. an imported spreadsheet cell with a note shows as a base line + the note's sub-lines
            ym = await pg.evaluate("[String(new Date().getFullYear()), new Date().getMonth()]")
            hdr = {'origin': BASE, 'x-requested-with': 'costs-tracker'}
            r = await admin_ctx.request.post(BASE + '/api/db/entries', headers=hdr, data={
                'year': ym[0], 'monthIndex': ym[1], 'type': 'expense', 'group': 'Fixed', 'category': 'Habitation', 'item': 'Note test item',
                'description': 'Imported', 'amount': 100, 'date': ym[0] + '-01-01', 'note': 'Alpha shop\nBeta shop (5/3)', 'realAmounts': [60, 40]})
            check('imported entry with note accepted', r.status in (200, 201), r.status)
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            row = pg.locator('.bd-row', has_text='Note test item').first
            check('note item row visible', await row.count() == 1)
            await row.locator('.note-count').click(); await pg.wait_for_timeout(200)
            tip = await pg.inner_text('#note-tip')
            check('note tip: base line + both sub-lines with real amounts', 'From your spreadsheet' in tip and 'Alpha shop' in tip and 'Beta shop' in tip and '60,00' in tip and '40,00' in tip and 'Imported' not in tip, tip)
            check('note tip: badge counts the 2 note lines', (await row.locator('.note-count').inner_text()).strip() == '2')
            # Entry counter (Pressed) and Entries tooltip against the design system (nodes 146:5252, 144:4426)
            t = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect(), q = (a, s) => a.querySelector(s);
                const b = document.querySelector('.note-count.is-open'), tip = document.getElementById('note-tip'), it = q(tip, '.tip-item'), name = q(it, '.tip-name'), date = q(tip, '.tip-item .tip-date'),
                      amt = q(it, '.tip-amount'), del = q(tip, '.tip-del'), dot = q(it, '.tip-dot');
                const tb = r(tip), bb = r(b);
                return { badge: b && { h: r(b).height, pad: cs(b).padding, bg: cs(b).backgroundColor, font: [cs(b).fontSize, cs(b).fontWeight, cs(b).lineHeight, cs(b).letterSpacing], fam: cs(b).fontFamily.split(',')[0], ml: cs(b).marginLeft },
                         tip: { radius: cs(tip).borderRadius, pad: cs(tip).padding, bg: cs(tip).backgroundColor, shadow: cs(tip).boxShadow, w: tb.width },
                         gapX: tb.left - bb.right, midDy: (tb.top + tb.height / 2) - (bb.top + bb.height / 2),
                         item: { h: r(it).height, gap: cs(it).columnGap, rgap: cs(q(it, '.tip-right')).columnGap, dot: [r(dot).width, r(dot).height] },
                         name: [cs(name).fontSize, cs(name).fontWeight, cs(name).lineHeight, cs(name).color], date: date ? [cs(date).fontSize, cs(date).fontWeight, cs(date).color, cs(date).lineHeight, cs(date).letterSpacing] : null,
                         amt: [cs(amt).fontFamily.split(',')[0], cs(amt).fontSize, cs(amt).fontWeight, cs(amt).letterSpacing], euro: !!q(amt, '.money-ic svg'),
                         del: del && { w: r(del).width, h: r(del).height, svg: [r(q(del, 'svg')).width, r(q(del, 'svg')).height], vb: q(del, 'svg').getAttribute('viewBox'), color: cs(del).color } }; }""")
            check('counter: 14px pill, 4px side padding (1px bottom lifts the digits), 8px from the name, action/press while its tooltip is open',
                  t['badge'] and t['badge']['h'] == 14 and t['badge']['pad'] == '0px 4px 1px' and t['badge']['ml'] == '8px' and t['badge']['bg'] == 'rgb(31, 30, 25)', t['badge'])
            check('counter text: 10px / 600 / 11.6px / -0.1px, same family as the page (not mono)', t['badge']['font'] == ['10px', '600', '11.6px', '-0.1px'] and 'Mono' not in t['badge']['fam'], t['badge'])
            check('tooltip: dark surface, radius 16, padding 16/8/16/16, 280 wide at least, no shadow', t['tip']['bg'] == 'rgb(22, 21, 15)' and t['tip']['radius'] == '16px' and t['tip']['pad'] == '16px 8px 16px 16px' and t['tip']['w'] >= 280 and t['tip']['shadow'] == 'none', t['tip'])
            check('tooltip opens beside the counter, 4px away, centred on it', abs(t['gapX'] - 4) < 0.6 and abs(t['midDy']) < 1.5, [t['gapX'], t['midDy']])
            check('tooltip entry: 24px row, 8px gaps (also between amount and remove), 12px dot', t['item']['h'] == 24 and t['item']['gap'] == '8px' and t['item']['rgap'] == '8px' and t['item']['dot'] == [12, 12], t['item'])
            check('tooltip entry text: name 12/500/17 white, date 12/600/14.4 +2% text-secondary', t['name'] == ['12px', '500', '17px', 'rgb(255, 255, 255)'] and t['date'] is not None and t['date'] == ['12px', '600', 'rgb(123, 120, 109)', '14.4px', '0.24px'], [t['name'], t['date']])
            check('tooltip amount: Euro icon + mono 12/500/-0.48px', t['euro'] and 'Mono' in t['amt'][0] and t['amt'][1:] == ['12px', '500', '-0.48px'], t['amt'])
            check('tooltip remove: Micro round button (14px) with the 10px X drawn on its own 10x10 frame, action/disable', t['del'] and t['del']['w'] == 14 and t['del']['h'] == 14 and t['del']['svg'] == [10, 10] and t['del']['vb'] == '0 0 10 10' and t['del']['color'] == 'rgb(170, 166, 152)', t['del'])
            await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5)

            # 2c. years list: newest first, and a duplicated year label appears once
            for y in ('2031', '2029', '2030', '2030'):
                await admin_ctx.request.post(BASE + '/api/db/years', headers=hdr, data={'year': y, 'currency': 'EUR', 'createdAt': '2026-01-01T00:00:00.000Z'})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            labels = [t.strip() for t in await pg.locator('.year-btn').all_inner_texts()]
            check('years listed newest first (as designed), each label once', labels[:3] == ['2031', '2030', '2029'] and labels.count('2030') == 1, labels)

            # 2b. main page against the Cost-tracker designs (node 2:2)
            d = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), q = s => document.querySelector(s);
                const col = s => cs(q(s)).backgroundColor, tok = n => cs(document.documentElement).getPropertyValue(n).trim();
                return { radius: cs(q('.balance-card')).borderRadius, kpiR: cs(q('.mini-kpi')).borderRadius,
                         cols: cs(q('.ticker-strip')).gridTemplateColumns.split(' ').length, segBg: col('.seg-tabs'), tag: [cs(q('.insight-tag')).borderRadius, col('.insight-tag')],
                         allocBar: cs(q('.alloc-bar')).width, allocGap: cs(q('.alloc-bars')).columnGap, monthsPad: cs(q('.months')).paddingLeft,
                         swatches: [...document.querySelectorAll('.legend .swatch')].map(e => cs(e).backgroundColor),
                         euro: !!q('.mini-kpi .money-ic svg'), tokens: [tok('--group-fixed'), tok('--group-variable'), tok('--group-extra'), tok('--group-additional'), tok('--chart-invest')] }; }""")
            check('cards are radius 20, KPI cards 16', d['radius'] == '20px' and d['kpiR'] == '16px', d)
            check('expense cards sit four across', d['cols'] == 4, d)
            check('Segments sit on surface/secondary, tags are 4px Label chips', d['segBg'] == 'rgb(239, 238, 229)' and d['tag'] == ['4px', 'rgb(239, 238, 229)'], d)
            check('allocation bars are 48 wide, 16 apart', d['allocBar'] == '48px' and d['allocGap'] == '16px', d)
            check('month row is indented 56', d['monthsPad'] == '56px', d)
            check('chart legend matches the lines: indigo, pink, lime', d['swatches'] == ['rgb(79, 70, 229)', 'rgb(227, 2, 159)', 'rgb(205, 217, 54)'], d)
            check('data colours come from the Color variables (purple, light blue, orange, pink, lime)', d['tokens'] == ['#4b0fa5', '#1dc0bb', '#ffba3a', '#e3029f', '#cdd936'], d)
            check('money figures carry the Euro icon', d['euro'], d)
            mb = await pg.evaluate("() => { const b = document.querySelector('.month-btn'), c = getComputedStyle(b); return [c.fontSize, c.fontWeight, c.lineHeight, c.letterSpacing, c.height, c.paddingLeft, c.textTransform]; }")
            check('month selector: 12px / 600 / line height auto / tracking 0, 20px pill with 8px padding (DS node 4:171)', mb == ['12px', '600', 'normal', 'normal', '20px', '8px', 'uppercase'], mb)   # Chrome reports tracking 0 as "normal"

            # 2c. the Sept 22 DS pull and the dashboard changes (Cost-tracker 2:2, 52:3443, 171:13746)
            n = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
                const tiles = all('#mini-kpis .mini-kpi'), lab = q('.mini-kpi .label'), tag = q('.insight-tag'), nm = q('.ticker-item .ti-name'), d = q('.hc-delta');
                const fig = e => [cs(e).fontSize, cs(e).fontWeight, cs(e).lineHeight, cs(e).letterSpacing];
                return { gauge: !!q('.gauge-wrap') || !!q('#gauge'), row2: !!q('.row2'), h2s: all('.card h2').map(h => h.textContent.trim()),
                         glance: !!q('.hero-left .glance-card #insight-text'), detail: tiles[2] && tiles[2].querySelector('.detail') ? tiles[2].querySelector('.detail').textContent : null,
                         detailStyle: tiles[2] && tiles[2].querySelector('.detail') ? [cs(tiles[2].querySelector('.detail')).fontFamily.includes('Mono'), ...fig(tiles[2].querySelector('.detail')).slice(0, 2), cs(tiles[2].querySelector('.detail')).letterSpacing, cs(tiles[2].querySelector('.detail')).color, cs(tiles[2].querySelector('.detail')).marginTop] : null,
                         noDetail: !tiles[0].querySelector('.detail') && !tiles[1].querySelector('.detail'),
                         label: fig(lab), tag: fig(tag).concat([cs(tag).height, cs(tag).paddingLeft, cs(tag).borderRadius]), name: fig(nm), segR: cs(q('.seg-tabs')).borderRadius,
                         delta: d ? { h: cs(d).height, r: cs(d).borderRadius, pad: cs(d).paddingLeft, font: fig(d), svg: d.querySelector('svg') ? [d.querySelector('svg').getBoundingClientRect().width, d.querySelector('svg').getBoundingClientRect().height] : null, cls: d.className, bg: cs(d).backgroundColor, label: d.getAttribute('aria-label') } : null };
            }""")
            check('Savings rate card is gone (no gauge, no second row); At a glance sits under Expense allocation', not n['gauge'] and not n['row2'] and 'Savings rate' not in n['h2s'] and n['glance'], n)
            check('Savings/Investments tile carries the rate: mono 12/500/-0.48px, text/secondary, 8px under the value; the other two tiles have none',
                  n['detail'] is not None and (n['detail'] == 'No income recorded' or (' rate - ' in n['detail'] and ' saved of ' in n['detail'])) and n['noDetail'] and n['detailStyle'] == [True, '12px', '500', '-0.48px', 'rgb(123, 120, 109)', '8px'], n)
            check('KPI and Expense card labels: 12px / 600 / line height auto / tracking 0', n['label'] == ['12px', '600', 'normal', 'normal'] and n['name'] == ['12px', '600', 'normal', 'normal'], n)
            check('Label chip (211:859): 12px / 600 / auto / 0, 20 high, 8px padding, 4px radius', n['tag'] == ['12px', '600', 'normal', 'normal', '20px', '8px', '4px'], n['tag'])
            check('Segments container radius is 8', n['segR'] == '8px', n['segR'])
            check('chart delta is a Label with a 12px sign icon',
                  n['delta'] and n['delta']['h'] == '20px' and n['delta']['r'] == '4px' and n['delta']['pad'] == '8px' and n['delta']['svg'] == [12, 12] and n['delta']['font'] == ['12px', '600', 'normal', 'normal']
                  and n['delta']['bg'] in ('rgb(227, 244, 236)', 'rgb(255, 196, 198)') and ('since' in (n['delta']['label'] or '')), n['delta'])
            tv = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), host = document.body, out = {};
                for (const t of ['success', 'fail', 'neutral']){
                  const el = document.createElement('div'); el.className = 'ds-toast visible ' + t; el.innerHTML = '<span class="ds-toast-icon"><svg viewBox="0 0 12 12"></svg></span><span>Saved</span>'; host.appendChild(el);
                  const c = cs(el), i = cs(el.firstChild); const r = el.getBoundingClientRect();
                  out[t] = { bg: c.backgroundColor, font: [c.fontSize, c.fontWeight, c.lineHeight, c.letterSpacing], gap: c.columnGap, h: r.height, r: c.borderRadius, pad: c.paddingLeft, bottom: innerHeight - r.bottom, right: innerWidth - r.right, icon: [i.width, i.height] };
                  el.remove(); }
                return out; }""")
            check('Toast (Sept 24): every type on surface/accent-deep, 14px SemiBold /15.2 -1%, 16px gap, 12px icon, 40 high, radius 8',
                  all(tv[k]['bg'] == 'rgb(6, 0, 108)' and tv[k]['font'] == ['14px', '600', '15.2px', '-0.14px'] and tv[k]['gap'] == '16px' and tv[k]['h'] == 40 and tv[k]['r'] == '8px' and tv[k]['pad'] == '16px' and tv[k]['icon'] == ['12px', '12px'] for k in tv), tv)
            check('Toast sits bottom-right, 24px from the window edges', all(abs(tv[k]['bottom'] - 24) < 1 and abs(tv[k]['right'] - 24) < 1 for k in tv), tv)
            yd = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), tab = document.createElement('div'); tab.className = 'year-tab'; tab.style.cssText = 'position:relative;width:48px;height:32px;margin:40px';
                tab.innerHTML = '<button class="year-btn">2031</button><button class="year-del-btn" aria-label="Delete"><svg viewBox="0 0 10 10"></svg></button>'; document.body.appendChild(tab);
                const b = tab.querySelector('.year-del-btn'), c = cs(b), tr = tab.getBoundingClientRect(), br = b.getBoundingClientRect(), o = { size: [br.width, br.height], dx: br.left - tr.left, dy: br.top - tr.top, bg: c.backgroundColor, r: c.borderRadius, svg: [cs(b.firstChild).width, cs(b.firstChild).height] };
                tab.remove(); return o; }""")
            check('Year tab delete = Micro round button: 14px, dark, 10px X, at x 41 / y -4 of a 48 x 32 tab (DS 53:801)', yd['size'] == [14, 14] and yd['bg'] == 'rgb(22, 21, 15)' and yd['r'] == '999px' and yd['svg'] == ['10px', '10px'] and abs(yd['dx'] - 41) < 0.6 and abs(yd['dy'] + 4) < 0.6, yd)

            # 2c. Sept 24 adjustments: sub-types only under Expenses; every item of the year listed, 0,00 when empty
            await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5)
            await pg.click('#breakdown-top-seg button[data-v=Income]'); await pg.wait_for_timeout(200)
            check('Tracker: Income shows no sub-types', not await pg.is_visible('#breakdown-group-seg'))
            await pg.click('#breakdown-top-seg button[data-v=Investments]'); await pg.wait_for_timeout(200)
            check('Tracker: Savings/Investments shows no sub-types', not await pg.is_visible('#breakdown-group-seg'))
            await pg.click('#breakdown-top-seg button[data-v=Expenses]'); await pg.wait_for_timeout(200)
            check('Tracker: Expenses shows the sub-types', await pg.is_visible('#breakdown-group-seg'))
            zeros = await pg.evaluate("[...document.querySelectorAll('#itemslist .bd-row')].filter(r => /(^|\\s)0,00$/.test(r.querySelector('.n').textContent.trim())).length")
            check('Tracker: items without entries are listed at 0,00', zeros > 0, zeros)

            # 3. CSV reading via the server-side reader
            await open_panel(pg)
            check('upload dropzone enabled', not await pg.evaluate("document.getElementById('dropzone').classList.contains('is-off')"))
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'statement.csv')]); await pg.wait_for_timeout(300)
            di = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect(), it = document.querySelector('.doc-item'), b = it.querySelector('.doc-remove'), sv = b.querySelector('svg');
                return { icon: (it.querySelector('.doc-ic svg').dataset.icon === 'document' || (!!window.ICON_LIB && it.querySelector('.doc-ic path').getAttribute('d') === window.ICON_LIB.document.d)), ic: [r(it.querySelector('.doc-ic svg')).width, r(it.querySelector('.doc-ic svg')).height],
                         btn: [r(b).width, r(b).height], svg: [r(sv).width, r(sv).height], vb: sv.getAttribute('viewBox'), color: cs(b).color, radius: cs(b).borderRadius, meta: it.querySelector('.doc-meta').textContent }; }""")
            check('file list: a CSV shows the Document icon (20px); delete = 24px round button with the 12px X in status/fail (174:15198)',
                  di['icon'] and di['ic'] == [20, 20] and di['btn'] == [24, 24] and di['svg'] == [12, 12] and di['vb'] == '0 0 12 12' and di['color'] == 'rgb(213, 57, 63)' and di['radius'] == '999px' and di['meta'].endswith('Ready'), di)
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('CSV: review shows a row from the AI reply', await pg.locator('.rv-row').count() == 1)
            # best-guess category: a reply without "sure" is marked, the status line says so, and Submit is not blocked
            check('reader prompt asks for certainty', '"certainty"' in state()['aiCalls'][-1]['prompt'])
            check('review: an unsure category carries a Guess (?) chip', await pg.locator('#rv-rows .rv-guess').count() == 1 and await pg.get_attribute('#rv-rows .rv-guess', 'aria-label') == 'Guess')
            check('review: status counts the guess and Submit stays enabled', (await pg.inner_text('#rv-status')).startswith('1 category is a guess') and not await pg.is_disabled('#rv-submit'), await pg.inner_text('#rv-status'))
            g = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), c = document.querySelector('#rv-rows .rv-guess'), l = document.querySelector('#rv-rows .c-cat .rv-link');
                return { r: cs(c).borderRadius, bg: cs(c).backgroundColor, h: c.getBoundingClientRect().height, w: c.getBoundingClientRect().width, fs: [cs(c).fontSize, cs(c).fontWeight], within: c.getBoundingClientRect().right <= c.closest('.c-cat').getBoundingClientRect().right + 0.5 && l.getBoundingClientRect().right <= c.getBoundingClientRect().left }; }""")
            check('Guess chip is the 4px Label chip, 20 high, and sits beside the category without overlap', g['r'] == '4px' and g['bg'] == 'rgb(239, 238, 229)' and g['h'] == 20 and g['w'] == 20 and g['fs'] == ['10px', '600'] and g['within'], g)
            await pg.click('#rv-rows .rv-row .c-cat .rv-link'); await pg.wait_for_selector('#rv-rows .rv-row.is-editing')
            await pg.keyboard.press('Enter'); await pg.wait_for_selector('.ds-dd-menu')
            await pg.click('.ds-dd-menu .ds-dd-item:text-is("Groceries")'); await pg.wait_for_timeout(150)  # the proposed one: confirming it is enough
            await pg.click('#add-panel-title'); await pg.wait_for_selector('#rv-rows .rv-row.is-editing', state='detached')
            check('review: choosing a category (even the proposed one) removes the Guess chip and the note', await pg.locator('#rv-rows .rv-guess').count() == 0 and (await pg.inner_text('#rv-status')).strip() == '', [await pg.locator('#rv-rows .rv-guess').count(), await pg.inner_text('#rv-status'), await pg.inner_text('#rv-rows')])
            # a reply that says "sure" is not marked
            await pg.click('#rv-cancel'); await open_panel(pg)
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'certain.csv')]); await pg.wait_for_timeout(300)
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('review: a "sure" category has no Guess chip', await pg.locator('#rv-rows .rv-row').count() == 1 and await pg.locator('#rv-rows .rv-guess').count() == 0)
            # "Month and year" (174:15607): starts on the month of the entry's date; an earlier month is refused, a later one is fine
            rp = await pg.evaluate("""() => { const t = document.getElementById('rv-period-trigger'), r = t.getBoundingClientRect(), l = document.querySelector('label[for="rv-period-trigger"]'); return { label: t.textContent.trim(), w: r.width, h: r.height, cap: l ? l.textContent : null }; }""")
            check('review: Month and year is a 200 x 48 dropdown, on the month of the entry (Sep 2026)', rp['label'] == 'September 2026' and rp['w'] == 200 and rp['h'] == 48 and (rp['cap'] or '').lower() == 'month and year', rp)
            await dd_pick(pg, 'rv-period', 'August', '2026')
            rs = await pg.inner_text('#rv-status')
            check('review: an entry dated after the month selected is refused (date in red, message, Submit off)',
                  "match the month and year selected" in rs and await pg.is_disabled('#rv-submit') and await pg.locator('#rv-rows .rv-date.bad').count() == 1, rs)
            await dd_pick(pg, 'rv-period', 'October', '2026')
            rs = await pg.inner_text('#rv-status')
            check('review: a later month is accepted and the status says where the entry will count', not await pg.is_disabled('#rv-submit') and 'will count toward October 2026' in rs and await pg.locator('#rv-rows .rv-date.bad').count() == 0, rs)
            await pg.click('#rv-submit'); await pg.wait_for_timeout(700)
            check('review: the entry is booked in the month picked (toast says Oct 2026)', 'Oct 2026' in await pg.inner_text('#ds-toast'), await pg.inner_text('#ds-toast'))
            check('reviewed row saved as third entry (after the imported note entry)', len([r for r in state()['rows'] if r['collection'] == 'entries']) == 3)
            check('AI got text only for CSV', state()['aiCalls'][-1]['images'] == 0 and 'FAKE SUPERMARKET' in state()['aiCalls'][-1]['prompt'], state()['aiCalls'][-1])

            # 3b. categories are per year: the pickers and the reader only offer what that year has
            for y, tax in (('2027', {'incomes': ['Freela'], 'investments': [], 'expenses': {'Variable': {'Food': ['Supermarket']}}}),
                           ('2028', {'incomes': ['Salary'], 'investments': ['Trips'], 'expenses': {'Fixed': {'Habitation': ['Rent']}}})):
                await admin_ctx.request.post(BASE + '/api/db/years', headers=hdr, data={'year': y, 'currency': 'EUR', 'createdAt': '2026-01-02T00:00:00.000Z', 'taxonomy': tax})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            await open_panel(pg)
            async def set_date(v):
                await pg.evaluate("v => { const i = document.getElementById('entry-date'); i.value = v; i.dispatchEvent(new Event('change', {bubbles:true})); }", v)
                await pg.wait_for_timeout(150)
            seg = lambda sid: pg.evaluate("id => [...document.querySelectorAll('#' + id + ' button')].filter(b => !b.hidden).map(b => b.textContent)", sid)
            await set_date('2028-05-10')
            check('2028: the Type controller only offers what that year has, in the Figma order (Income, Savings/Investment, Expenses; Fixed)', await seg('entry-type-seg') == ['Income', 'Savings/Investment', 'Expenses'] and await seg('entry-group-seg') == ['Fixed'], [await seg('entry-type-seg'), await seg('entry-group-seg')])
            check('2028: Category menu only has its own category', await dd_structure(pg, 'entry-cat') == [[None, ['Habitation']]], await dd_structure(pg, 'entry-cat'))
            check('the Type dropdown waits for a Category', await pg.eval_on_selector('#entry-item', 'e => e.disabled'))
            await dd_pick(pg, 'entry-cat', 'Habitation')
            check('2028: Sub-category menu only has that category\'s items', await dd_structure(pg, 'entry-item') == [[None, ['Rent']]], await dd_structure(pg, 'entry-item'))
            check('2028: Habitation has one sub-category, so Rent is selected automatically (174:15087)', await dd_text(pg, 'entry-item') == 'Rent' and await pg.eval_on_selector('#entry-item', 'e => e.value') == 'Rent', await dd_text(pg, 'entry-item'))
            await set_date('2027-05-10'); await pg.click('#entry-group-seg button[data-v=Variable]'); await pg.wait_for_timeout(100)
            check('2027: Variable offers Food only, and its Type menu is empty until Food is picked', await dd_structure(pg, 'entry-cat') == [[None, ['Food']]] and await pg.eval_on_selector('#entry-item', 'e => e.disabled'), await dd_structure(pg, 'entry-cat'))
            await dd_pick(pg, 'entry-cat', 'Food')
            check('2027: Food has the Supermarket type', await dd_structure(pg, 'entry-item') == [[None, ['Supermarket']]], await dd_structure(pg, 'entry-item'))
            check('2027: Food has one sub-category, so Supermarket is selected automatically', await dd_text(pg, 'entry-item') == 'Supermarket' and await pg.eval_on_selector('#entry-item', 'e => e.value') == 'Supermarket', await dd_text(pg, 'entry-item'))
            check('the controller shows the choice: Expenses and Variable pressed', await pg.evaluate("[document.querySelector('#entry-type-seg [aria-pressed=true]').textContent, document.querySelector('#entry-group-seg [aria-pressed=true]').textContent]") == ['Expenses', 'Variable'])
            await pg.click('#entry-type-seg button[data-v=income]'); await pg.wait_for_timeout(100)
            check('2027: Income has no Category and no sub-types; its Type dropdown lists the income items', await dd_structure(pg, 'entry-item') == [[None, ['Freela']]] and await pg.locator('#entry-category-field').is_hidden() and await pg.locator('#entry-group-field').is_hidden(), await dd_structure(pg, 'entry-item'))
            # spec metrics from the Figma Dropdown / DropdownItem / Dropdown-list components (the Add to menu is grouped by year)
            await pg.click('#entry-period-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            m = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect();
                const menu = document.querySelector('.ds-dd-menu'), g = menu.querySelector('.ds-dd-group'), its = [...menu.querySelectorAll('.ds-dd-block')[0].querySelectorAll('.ds-dd-item')], t = document.getElementById('entry-period-trigger');
                return { pad: cs(menu).padding, gFont: [cs(g).fontSize, cs(g).fontWeight, cs(g).lineHeight], gX: r(g).left - r(menu).left - 1, itemH: r(its[0]).height, itemPad: cs(its[0]).padding, iFont: [cs(its[0]).fontSize, cs(its[0]).fontWeight, cs(its[0]).lineHeight],
                         itemGap: its.length > 1 ? r(its[1]).top - r(its[0]).bottom : 4, itemX: r(its[0]).left - r(menu).left - 1, tFont: [cs(t).fontSize, cs(t).lineHeight, cs(t).letterSpacing], tPad: cs(t).padding, tBg: cs(t).backgroundColor, tSel: cs(its[0]).fontWeight }; }""")
            check('menu: padding 16, group label 14px/600/15.2 flush, rows 25px tall with 4/8 padding, 4px apart, 12px/500/17',
                  m['pad'] == '16px' and m['gFont'] == ['14px', '600', '15.2px'] and abs(m['gX'] - 16) < 0.6 and m['itemH'] == 25 and m['itemPad'] == '4px 8px' and m['iFont'] == ['12px', '500', '17px'] and m['itemGap'] == 4 and abs(m['itemX'] - 16) < 0.6, m)
            check('trigger in the panel: 14px / 15.2px / -0.14px, 16px side padding, no fill', m['tFont'] == ['14px', '15.2px', '-0.14px'] and m['tPad'] == '0px 16px' and m['tBg'] == 'rgba(0, 0, 0, 0)', m)
            await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            # keyboard: open with Enter, move, choose with Enter; Escape only closes the menu
            await pg.focus('#entry-item-trigger'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.ds-dd-menu')
            await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            check('Escape closes the menu but not the panel', await pg.get_attribute('#tracker-add-btn', 'aria-pressed') == 'true')
            await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
            check('keyboard picks an option', await dd_text(pg, 'entry-item') == 'Freela', await dd_text(pg, 'entry-item'))
            # the native select still holds the value, and the menu lands inside the viewport
            check('hidden select keeps the value', await pg.eval_on_selector('#entry-item', 'e => e.value') == 'Freela')
            await pg.click('#entry-item-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            box = await pg.eval_on_selector('.ds-dd-menu', 'e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; }')
            check('menu stays inside the viewport', box[0] >= 0 and box[1] >= 0 and box[2] <= box[4] and box[3] <= box[5], box)
            await pg.mouse.click(5, 5); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            check('clicking outside closes the menu', True)
            await pg.keyboard.press('Escape')

            # 3c. "Add to" (174:15081): the month and year an entry is booked in. Dated after it: refused. In it or earlier: fine.
            await open_panel(pg)
            entries_n = lambda: len([r for r in state()['rows'] if r['collection'] == 'entries'])
            async def fill_entry(desc):
                await pg.click('#entry-type-seg button[data-v=income]'); await pg.wait_for_timeout(100)
                opts = await pg.evaluate("[...document.querySelectorAll('#entry-item option')].map(o => o.value).filter(Boolean)")
                await pg.evaluate("v => { const s = document.getElementById('entry-item'); s.value = v; s.dispatchEvent(new Event('change', {bubbles:true})); }", opts[0])
                await pg.fill('#entry-desc', desc); await pg.fill('#entry-amount', '10')
            grp = await dd_structure(pg, 'entry-period')
            check('Add to: every month of every year, newest year first', [g[0] for g in grp][:3] == ['2031', '2030', '2029'] and all(len(g[1]) == 12 for g in grp[:6]), [[g[0], len(g[1])] for g in grp])
            box = await pg.evaluate("() => { const r = document.getElementById('entry-period-trigger').getBoundingClientRect(); return [r.width, r.height, document.querySelector('label[for=\"entry-period-trigger\"]').textContent]; }")
            check('Month and year: 200 x 48 dropdown under a "Month and year" label', box[0] == 200 and box[1] == 48 and box[2].lower() == 'month and year', box)
            lay = await pg.evaluate("""() => { const r = id => document.getElementById(id).closest('.field').getBoundingClientRect(), seg = document.getElementById('entry-type-seg').getBoundingClientRect(), sub = document.getElementById('entry-group-seg').getBoundingClientRect(),
                    lab = document.querySelector('.ap-type .field-label'), cs = getComputedStyle(lab), order = [...document.querySelectorAll('#entry-type-seg button')].map(b => b.textContent);
                const p = r('entry-period'), d = r('entry-desc'), c = r('entry-cat'), i = r('entry-item'), dt = r('entry-date'), a = r('entry-amount');
                return { order, segH: seg.height, subH: sub.height, subGap: sub.top - seg.bottom, label: [cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing, cs.color, lab.textContent],
                         itemLabel: document.querySelector('label[for="entry-item-trigger"]').textContent, periodLabel: document.querySelector('label[for="entry-period-trigger"]').textContent,
                         stack: p.top < d.top && d.top < c.top && c.top < dt.top, cols: c.left === dt.left && i.left === a.left && i.left - c.right, rows: [d.top - p.bottom, c.top - d.bottom, dt.top - c.bottom, i.top === c.top, a.top === dt.top] }; }""")
            check('Figma 174:15081: Type controller (Income, Savings/Investment, Expenses + 4 sub-types), then Month and year, Description, Category | Sub-category, Date | Amount, all 8 apart',
                  lay['order'] == ['Income', 'Savings/Investment', 'Expenses'] and lay['segH'] == 41 and lay['subH'] == 32 and lay['subGap'] == 8 and lay['label'][:5] == ['12px', '600', 'normal', 'normal', 'rgb(123, 120, 109)'] and lay['label'][5].lower() == 'type' and lay['itemLabel'].lower() == 'sub-category' and lay['periodLabel'].lower() == 'month and year'
                  and lay['stack'] and lay['cols'] == 8 and lay['rows'] == [8, 8, 8, True, True], lay)
            await set_date('2029-09-13')
            check('Add to follows the date until it is picked by hand', await dd_text(pg, 'entry-period') == 'September 2029', await dd_text(pg, 'entry-period'))
            await dd_pick(pg, 'entry-period', 'August', '2029'); await fill_entry('Too early')
            n0 = entries_n(); await pg.click('#entry-submit'); await pg.wait_for_timeout(500)
            es = await pg.inner_text('#entry-status')
            check('a date after the month selected is refused with the mismatch message, nothing saved', "date of the entry (13/09/2029) doesn't match the month and year selected (August 2029)" in es and entries_n() == n0, [es, entries_n(), n0])
            await set_date('2029-09-14')
            check('once picked by hand, the month stays when the date changes', await dd_text(pg, 'entry-period') == 'August 2029', await dd_text(pg, 'entry-period'))
            await dd_pick(pg, 'entry-period', 'October', '2029')
            await pg.click('#entry-submit'); await pg.wait_for_timeout(700)
            check('a date in the month before the one selected is accepted, and lands in that month (13/09 into October)', entries_n() == n0 + 1 and 'Oct 2029' in await pg.inner_text('#ds-toast'), [entries_n(), n0, await pg.inner_text('#ds-toast')])
            today_label = await pg.evaluate("() => { const d = new Date(); return ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()] + ' ' + d.getFullYear(); }")
            check('after saving, the panel starts over on today\'s month', await dd_text(pg, 'entry-period') == today_label, [await dd_text(pg, 'entry-period'), today_label])
            await set_date('2028-05-10')
            check('after a reset the month follows the date again', await dd_text(pg, 'entry-period') == 'May 2028', await dd_text(pg, 'entry-period'))
            await pg.keyboard.press('Escape')

            # 4. photo reading sends an image
            await open_panel(pg)
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'receipt.png')]); await pg.wait_for_timeout(500)
            check('file list: a photo shows the Image icon', await pg.evaluate("document.querySelector('.doc-item .doc-ic svg').dataset.icon === 'image' || (!!window.ICON_LIB && document.querySelector('.doc-item .doc-ic path').getAttribute('d') === window.ICON_LIB.image.d)"))
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('photo: image sent to the reader', state()['aiCalls'][-1]['images'] == 1, state()['aiCalls'][-1])
            # review table: Type and Category are the same dropdown, and the row stays open while the menu is used
            await pg.click('#rv-rows .rv-row .c-cat .rv-link'); await pg.wait_for_selector('#rv-rows .rv-row.is-editing')
            check('review: Category trigger takes focus on edit', await pg.evaluate("document.activeElement && document.activeElement.classList.contains('ds-dd-trigger')"))
            await pg.keyboard.press('Enter'); await pg.wait_for_selector('.ds-dd-menu')
            check('review: row stays in edit mode while the menu is open', await pg.locator('#rv-rows .rv-row.is-editing').count() == 1)
            await pg.click('.ds-dd-menu .ds-dd-item >> nth=0'); await pg.wait_for_timeout(200)
            check('review: picking sets the row category and keeps editing', await pg.eval_on_selector('#rv-rows [data-f=cat]', 'e => e.value') != '' and await pg.locator('#rv-rows .rv-row.is-editing').count() == 1)
            await pg.click('#rv-rows .rv-row.is-editing [data-f=type] + .ds-dd-trigger, #rv-rows .rv-row.is-editing .c-type .ds-dd-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            check('review: Type menu is grouped', (await pg.locator('.ds-dd-menu .ds-dd-group').first.inner_text()) == 'Expenses')
            await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            check('review: Escape closed the menu, row still editing', await pg.locator('#rv-rows .rv-row.is-editing').count() == 1)
            cur = await pg.evaluate('String(new Date().getFullYear())')
            pr = state()['aiCalls'][-1]['prompt']
            check('reader is shown the current year categories, not the generic starter list', f'exist in {cur})' in pr and 'Supermarket' in pr and 'Restaurants' not in pr and 'Taxi' not in pr, pr[-600:])
            await pg.keyboard.press('Escape')

            # 4b. from the 25th of December, January of the next year is open for entries (and the first one creates the year)
            fake = lambda d, m, day: "(() => { const R = Date, T = new R(%d, %d, %d, 10, 0, 0).getTime(), off = T - R.now(); class D extends R { constructor(...a){ if (a.length === 0) super(R.now() + off); else super(...a); } static now(){ return R.now() + off; } } window.Date = D; })();" % (d, m, day)
            storage = await admin_ctx.storage_state()
            for day, label in ((20, 'Dec 20'), (27, 'Dec 27')):
                yc = await b.new_context(viewport={'width': 1300, 'height': 900}, storage_state=storage)
                await yc.add_init_script(fake(2035, 11, day))
                yp = await yc.new_page(); yerrs = []
                yp.on('pageerror', lambda e: yerrs.append(str(e)))
                await yp.goto(BASE + '/'); await yp.wait_for_selector('#user-nav'); await yp.wait_for_timeout(900)
                await open_panel(yp)
                mx = await yp.eval_on_selector('#entry-date', 'e => e.max')
                if day == 20:
                    check('Dec 20: the date field stops at the last existing year', mx == '2031-12-31', mx)
                else:
                    check('Dec 27: the date field also opens January of the next year (2036-01-31)', mx == '2036-01-31', mx)
                    async def try_add(date, desc):
                        await yp.evaluate("v => { const i = document.getElementById('entry-date'); i.value = v; i.dispatchEvent(new Event('change', {bubbles:true})); }", date)
                        await yp.wait_for_timeout(200)
                        await yp.click('#entry-type-seg button[data-v=income]'); await yp.wait_for_timeout(100)
                        opts = await yp.evaluate("[...document.querySelectorAll('#entry-item option')].map(o => o.value).filter(Boolean)")
                        await yp.evaluate("v => { const s = document.getElementById('entry-item'); s.value = v; s.dispatchEvent(new Event('change', {bubbles:true})); }", opts[0])
                        await yp.fill('#entry-desc', desc); await yp.fill('#entry-amount', '1234.5')
                        await yp.click('#entry-submit'); await yp.wait_for_timeout(1500)
                    await try_add('2036-02-05', 'Too far')
                    labels = [t.strip() for t in await yp.locator('.year-btn').all_inner_texts()]
                    check('Dec 27: February of the missing year is still refused, no year created', '2036' not in labels and 'match the month and year selected' in await yp.inner_text('#entry-status'), [labels, await yp.inner_text('#entry-status')])
                    await try_add('2036-01-15', 'Salary for January')
                    labels = [t.strip() for t in await yp.locator('.year-btn').all_inner_texts()]
                    check('Dec 27: an entry dated 15 Jan 2036 creates 2036 and is saved in January', '2036' in labels and await yp.locator('.year-btn[aria-pressed="true"]').inner_text() == '2036' and '1.234,50' in await yp.inner_text('body'), [labels, await yp.inner_text('#entry-status')])
                    check('Dec 27: no page errors', not yerrs, yerrs)
                await yc.close()

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
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            check('admin: a pending account lights the notification dot', await pg.locator('#user-nav .ds-notif-badge').count() == 1)
            await pg.click('#notif-btn'); await pg.wait_for_selector('#notif-panel')
            item = pg.locator('#notif-panel .ds-notif-item', has_text='ann@example.com is waiting for your approval.')
            check('admin: the notification names the account waiting for approval', await item.count() == 1, await pg.inner_text('#notif-panel'))
            await item.get_by_text('Approve', exact=True).click(); await pg.wait_for_timeout(400)
            check('approving from the notification clears it', await pg.locator('#user-nav .ds-notif-badge').count() == 0)
            await pg.keyboard.press('Escape')
            await ann.goto(BASE + '/'); await ann.wait_for_selector('#user-nav'); await ann.wait_for_timeout(700)
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

            # 7. daily cap (5): admin already used 3 reads
            await pg.reload(); await pg.wait_for_selector('#user-nav')
            codes = []
            for _ in range(4):
                rr = await admin_ctx.request.post(BASE + '/api/read-document', data={'prompt': 'x'}, headers={'origin': BASE, 'x-requested-with': 'costs-tracker'}); codes.append(rr.status)
            check('daily read cap enforced', codes == [200, 200, 429, 429], codes)

            # 7b. removing an entry from the Entries tooltip confirms with a toast
            r = await admin_ctx.request.post(BASE + '/api/db/entries', headers=hdr, data={
                'year': ym[0], 'monthIndex': ym[1], 'type': 'income', 'group': None, 'category': None, 'item': 'Toast test', 'description': 'Toast test', 'amount': 5, 'date': ym[0] + '-%02d-01' % (ym[1] + 1)})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            await pg.click('#breakdown-top-seg button[data-v=Income]'); await pg.wait_for_timeout(200)
            await pg.locator('.meter-row', has_text='Toast test').locator('.note-count').click(); await pg.wait_for_timeout(200)
            await pg.locator('#note-tip .tip-item', has_text='Toast test').locator('.tip-del').click()
            await pg.wait_for_selector('#ds-toast.visible', timeout=4000)
            check('removing an entry shows a toast', 'removed' in await pg.inner_text('#ds-toast'), await pg.inner_text('#ds-toast'))

            # 8. erase my data, then sign out
            await ann.click('#user-menu-btn'); await ann.click('#menu-account'); await ann.wait_for_selector('#account-dialog[open]')
            check('greets the user by the first part of the email', (await ann.inner_text('.app-title')).strip() == 'Hey, Ann')
            await ann.click('text=Delete all my data'); await ann.click('text=Click again to permanently delete'); await ann.wait_for_url('**/login', timeout=5000)
            check('erase: key and rows removed for that user', len(state()['keys']) == 1)
            await pg.click('#user-menu-btn'); await pg.click('#menu-signout'); await pg.wait_for_url('**/login', timeout=5000)
            check('sign-out returns to login', True)
            await b.close()
    finally:
        srv.terminate()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
asyncio.run(main())
