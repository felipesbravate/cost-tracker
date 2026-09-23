"""Component parity: the React Okara components against the same components in the legacy tracker.

Run:  python3 tests/ui/parity.py            (needs the gallery running: `npx next dev -p 3300`, or GALLERY_URL)
For every case in src/ui/gallery/cases.jsx that has `legacy: { state, selector }`, it opens the legacy page
(mock server + the capture.py seed data, clock frozen on 23 Sep 2026) and the gallery, then compares
  1. the DOM: tags, attributes (class and style parsed, order ignored), text; and
  2. the pixels: a screenshot of the element, with the gallery case laid out at the legacy element's width.
Exit code 1 when anything differs; diff images go to /tmp/okara-parity/.
"""
import asyncio, json, os, sys
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tests', 'visual'))
import capture as cap  # noqa: E402  (seed data, fonts, frozen clock, mock server)
from playwright.async_api import async_playwright  # noqa: E402

GALLERY = os.environ.get('GALLERY_URL', 'http://127.0.0.1:3300/dev/components')
OUT = '/tmp/okara-parity'
TOL, MAX_PX = 16, 12

# DOM snapshot: element -> [tag, {attrs}, children]; whitespace-only text dropped, adjacent text merged.
# Not compared: `selected` on the hidden <option> (React sets the value as a property), the legacy page's
# event-wiring data attributes, and the computed position (left/top) of floating layers.
SNAP = """(el) => { const walk = (n) => {
  const attrs = {};
  const floating = n.id === 'note-tip' || n.classList.contains('ds-dd-menu');
  for (const a of n.attributes) {
    if (a.name === 'selected' || a.name === 'data-icon' || a.name === 'data-id' || a.name === 'data-base' || a.name === 'data-ovid' || (floating && a.name === 'style')) continue;
    if (a.name === 'class') attrs.class = [...n.classList].sort().join(' ');
    else if (a.name === 'style') { const s = []; for (let i = 0; i < n.style.length; i++) { const p = n.style[i]; s.push(p + ':' + n.style.getPropertyValue(p).replace(/\\s+/g, ' ').trim()); } attrs.style = s.sort().join('; '); }
    else attrs[a.name] = a.value;
  }
  const kids = []; let text = '';
  const flush = () => { if (text.trim()) kids.push(text.replace(/\\s+/g, ' ').trim()); text = ''; };
  for (const c of n.childNodes) { if (c.nodeType === 3) text += c.textContent; else if (c.nodeType === 1) { flush(); kids.push(walk(c)); } }
  flush();
  return [n.tagName.toLowerCase(), attrs, kids]; };
  return walk(el); }"""

def diff_dom(a, b, path='root'):
    if isinstance(a, str) or isinstance(b, str):
        return [] if a == b else [f'{path}: text {a!r} != {b!r}']
    out = []
    if a[0] != b[0]: return [f'{path}: <{a[0]}> != <{b[0]}>']
    for k in sorted(set(a[1]) | set(b[1])):
        if a[1].get(k) != b[1].get(k): out.append(f'{path}<{a[0]}> @{k}: {str(a[1].get(k))[:80]!r} != {str(b[1].get(k))[:80]!r}')
    if len(a[2]) != len(b[2]): out.append(f'{path}<{a[0]}>: {len(a[2])} children != {len(b[2])}')
    for i, (x, y) in enumerate(zip(a[2], b[2])): out += diff_dom(x, y, f'{path}/{a[0]}[{i}]')
    return out

async def main():
    os.makedirs(OUT, exist_ok=True)
    cases = await gallery_cases()
    failures = 0
    srv = await cap.start_server()
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
            seed_ctx = await b.new_context(); await seed_ctx.add_init_script(cap.FROZEN); await cap.route_fonts(seed_ctx)
            pg = await seed_ctx.new_page(); await pg.goto(cap.BASE + '/login'); await pg.fill('input[name=email]', 'admin@example.com'); await pg.click('button')
            await pg.wait_for_selector('.ct-shell'); await cap.seed(seed_ctx); storage = await seed_ctx.storage_state(); await seed_ctx.close()

            vp = {'width': 1440, 'height': 1000}
            lctx = await b.new_context(viewport=vp, storage_state=storage, device_scale_factor=1); await lctx.add_init_script(cap.FROZEN); await cap.route_fonts(lctx)
            gctx = await b.new_context(viewport=vp, device_scale_factor=1); await cap.route_fonts(gctx)
            legacy = await lctx.new_page(); state = None
            gal = await gctx.new_page(); await gal.goto(GALLERY); await gal.wait_for_selector('[data-case]'); await gal.add_style_tag(content=cap.CALM); await gal.evaluate('document.fonts.ready')
            for c in sorted(cases, key=lambda c: c['state'] or ''):
                if c['state'] != state:
                    state = c['state']; await cap.fresh(legacy); await STATES[state](legacy)
                el = legacy.locator(c['selector']).first
                await el.scroll_into_view_if_needed()
                ldom = await el.evaluate(SNAP)
                lr = await el.evaluate('e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }')
                box = gal.locator(f'[data-case="{c["id"]}"]')
                # menus are portalled to <body>; everything else is looked up inside the case
                gel = (gal if c['open'] else box).locator(c['compare']).first if c['compare'] else box.locator(':scope > *').first
                async def reopen():
                    if not c['open']: return
                    await gal.keyboard.press('Escape'); await gal.mouse.click(1, 1); await gal.wait_for_timeout(50)
                    await box.locator(c['open']).first.click(); await gal.wait_for_timeout(100)
                # same width as the legacy element (floating layers: set by the case), and the same sub-pixel
                # offset, so antialiasing lines up
                await box.evaluate('(e, w) => { if (!e.dataset.open) e.style.width = w + "px"; e.style.position = "relative"; e.style.left = "0px"; e.style.top = "0px"; }', lr['w'])
                # transparent parts show what's behind them: give the case the backdrop the legacy element sits on
                bg = await el.evaluate("e => { for (let n = e.parentElement; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; } return 'rgb(255, 255, 255)'; }")
                await box.evaluate('(e, bg) => { e.style.background = bg; }', bg)
                await box.scroll_into_view_if_needed(); await reopen()
                gr = await gel.evaluate('e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; }')
                frac = lambda v: v - int(v // 1)
                delta = [frac(lr['x']) - frac(gr['x']), frac(lr['y']) - frac(gr['y'])]
                if c['compare'] and not c['open'] and await gel.evaluate("e => ['fixed', 'absolute'].includes(getComputedStyle(e).position) && !!e.style.left"):
                    # a positioned layer inside a transformed box snaps to whole pixels: nudge the layer itself
                    await gel.evaluate('(e, d) => { e.style.left = (parseFloat(e.style.left) + d[0]) + "px"; e.style.top = (parseFloat(e.style.top) + d[1]) + "px"; }', delta)
                else:
                    await box.evaluate('(e, d) => { e.style.left = d[0] + "px"; e.style.top = d[1] + "px"; }', delta)
                await reopen()
                gdom = await gel.evaluate(SNAP)
                problems = diff_dom(ldom, gdom)
                await legacy.mouse.move(1, 1)
                if not c['open']: await gal.mouse.move(1, 1)
                la, ga = os.path.join(OUT, c['id'] + '.legacy.png'), os.path.join(OUT, c['id'] + '.react.png')
                async def shot(page, loc, path):
                    # viewport coordinates (the element is on screen), so fixed layers are clipped where they are
                    # only the pixels the element fully covers: a partly covered edge row blends with whatever is next to it
                    r = await loc.evaluate('e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }')
                    x0, y0 = int(-(-r[0] // 1)), int(-(-r[1] // 1))
                    x1, y1 = int((r[0] + r[2]) // 1), int((r[1] + r[3]) // 1)
                    await page.screenshot(path=path, animations='disabled', clip={'x': x0, 'y': y0, 'width': x1 - x0, 'height': y1 - y0})
                await shot(legacy, el, la); await shot(gal, gel, ga)
                A, B = Image.open(la).convert('RGB'), Image.open(ga).convert('RGB')
                if c['open'] and A.size[0] == B.size[0] and A.size != B.size:
                    # a menu's height depends on where its trigger sits in the window: compare the part both show
                    h = min(A.size[1], B.size[1]) - 1; A, B = A.crop((0, 0, A.size[0], h)), B.crop((0, 0, B.size[0], h))
                if A.size != B.size: problems.append(f'pixels: size {A.size} != {B.size}')
                else:
                    d = ImageChops.difference(A, B).convert('L').point(lambda v: 255 if v > TOL else 0)
                    if c['compare'] or c['open']:
                        # floating layers: their rounded corners blend with whatever is under them on each page
                        w, h = d.size
                        for cx, cy in ((0, 0), (w - 10, 0), (0, h - 10), (w - 10, h - 10)): d.paste(0, (max(cx, 0), max(cy, 0), max(cx, 0) + 10, max(cy, 0) + 10))
                    n = d.histogram()[255]
                    if n > MAX_PX: problems.append(f'pixels: {n} differ in {d.getbbox()}')
                print(('PASS ' if not problems else 'FAIL ') + c['id'])
                for pr in problems[:8]: print('     ', pr)
                failures += bool(problems)
            await b.close()
    finally:
        srv.terminate()
    print(f'\n{len(cases) - failures}/{len(cases)} components match the legacy page')
    sys.exit(1 if failures else 0)

# capture.py states a parity case can ask for (the legacy page is put in that state before comparing)
STATES = {'dashboard': cap.s_dash, 'panel': cap.s_panel, 'category-menu': cap.s_panel_cat_menu, 'period-menu': cap.s_panel_period_menu,
          'entries-tooltip': cap.s_note_tip, 'toast': cap.s_toast}

async def gallery_cases():
    """Read the parity cases (id + legacy selector) from the running gallery page."""
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
        pg = await b.new_page(); await pg.goto(GALLERY); await pg.wait_for_selector('[data-case]')
        cases = await pg.evaluate("[...document.querySelectorAll('[data-case][data-legacy]')].map(e => ({ id: e.dataset.case, selector: e.dataset.legacy, state: e.dataset.state, open: e.dataset.open || null, compare: e.dataset.compare || null }))")
        await b.close()
    return cases

if __name__ == '__main__':
    asyncio.run(main())
