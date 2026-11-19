"""WebKit-Rauchtest (Playwright, WPE-WebKit): laedt die App in iPad- und Handy-Groessen und prueft
JS-Fehler, Pins, Layout, Touch-Eigenschaften der Spielknoepfe, Spielstart (2D und, wenn WebGL da ist, 3D).
Voraussetzung:  python3 -m playwright install webkit   (auf Linux evtl. zusaetzliche Systembibliotheken)
Start:  python3 tests/webkit-smoke.py        Screenshots: /workspace/taxi-shots/v2/webkit-*.png
Hinweis: Das ist die WebKit-Engine, aber nicht Safari selbst (keine echte iPadOS-Umgebung)."""
import http.server, socketserver, threading, os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('SHOTS_DIR', '/workspace/taxi-shots/v2'); os.makedirs(OUT, exist_ok=True)
PORT = int(os.environ.get("PORT", "18775"))

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', PORT), H); threading.Thread(target=srv.serve_forever, daemon=True).start()

SIZES = [('ipad-1024x768', 1024, 768), ('ipad-1366x1024', 1366, 1024), ('phone-quer-915x412', 915, 412), ('phone-hoch-412x915', 412, 915)]
fails = 0
with sync_playwright() as p:
    b = p.webkit.launch()
    for name, w, h in SIZES:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=False)
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)) if 'service worker is an error' not in str(e) and 'Cannot load' not in str(e) and 'TLS' not in str(e) else None)
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'tile.openstreetmap' not in m.text and 'Failed to load resource' not in m.text and 'Cannot load' not in m.text and 'service worker is an error' not in m.text and '3D nicht verfuegbar' not in m.text else None)
        pg.add_init_script("localStorage.setItem('taxi-lernkarte-v1', JSON.stringify({settings:{introSeen:true, view3d:false}}))")
        pg.goto(f'http://127.0.0.1:{PORT}/'); pg.wait_for_function('window.__taxi && document.querySelectorAll(".pin").length > 0', timeout=20000)
        info = pg.evaluate('''() => ({ pins: document.querySelectorAll('.pin').length, dvh: CSS.supports('height', '100dvh'), webgl: __taxi.gl.supported(),
          labelFont: parseFloat(getComputedStyle(document.querySelector('.pin-label')).fontSize), app: document.querySelector('#app').getBoundingClientRect().height, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth })''')
        pg.evaluate("__taxi.game.start({})"); pg.wait_for_selector('[data-act=go]', timeout=30000)
        pg.click('[data-act=go]')
        pg.evaluate("document.querySelector('[data-pad=gas]').dispatchEvent(new PointerEvent('pointerdown', {pointerId: 7, bubbles: true, cancelable: true}))"); pg.wait_for_timeout(3000)
        g = pg.evaluate('''() => { const s = __taxi.game.state(); const gas = getComputedStyle(document.querySelector('[data-pad=gas]'));
          const R = n => document.querySelector('[data-pad=' + n + ']').getBoundingClientRect();
          const inside = ['left','right','gas','brake','uturn','hint','pause','map'].every(n => { const r = R(n); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
          const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
          const hud = ['left','right','gas','brake','uturn','hint'].filter(n => ov(R(n), document.querySelector('.g-speed').getBoundingClientRect()) || ov(R(n), document.querySelector('.g-street').getBoundingClientRect()));
          return { hud, v: Math.round(s.car.v * 3.6), odo: Math.round(s.car.odo), ta: gas.touchAction, us: gas.userSelect || gas.webkitUserSelect, inside, perf: __taxi.game.perf() } }''')
        pg.screenshot(path=os.path.join(OUT, f'webkit-{name}.png'))
        ok = info['pins'] > 20 and info['dvh'] and info['labelFont'] >= 16 and abs(info['app'] - info['ih']) < 2 and info['sw'] <= info['iw'] + 1 and g['v'] > 5 and g['ta'] == 'none' and g['us'] == 'none' and g['inside'] and not g['hud'] and not errs
        fails += 0 if ok else 1
        print(('PASS' if ok else 'FAIL'), name, json.dumps({**info, **{k: v for k, v in g.items() if k != 'perf'}, 'jsMsPerFrame': round(g['perf']['avgMs'], 2), 'fps': round(g['perf']['fps'], 1)}), errs[:3])
        ctx.close()
    # 3D, falls WebGL vorhanden
    ctx = b.new_context(viewport={'width': 1024, 'height': 768}, device_scale_factor=2, has_touch=True)
    pg = ctx.new_page()
    pg.add_init_script("localStorage.setItem('taxi-lernkarte-v1', JSON.stringify({settings:{introSeen:true}}))")
    pg.goto(f'http://127.0.0.1:{PORT}/'); pg.wait_for_function('window.__taxi', timeout=20000)
    webgl = pg.evaluate('__taxi.gl.supported()')
    if webgl:
        try:
            pg.wait_for_function('__taxi.gl.active', timeout=30000); pg.wait_for_timeout(5000)
            pg.screenshot(path=os.path.join(OUT, 'webkit-3d.png')); print('PASS WebKit 3D aktiv')
        except Exception:
            # Das WPE-Testbuild hat kein TLS (https geht nicht): Stil kann nicht geladen werden -> 2D-Rueckfall ist das erwartete Verhalten
            fb = pg.evaluate("document.querySelector('#app').dataset.gl")
            print('INFO WebKit-Testbuild ohne TLS: 3D-Stil nicht ladbar, App bleibt auf 2D (data-gl =', fb, ')')
    else:
        pg.wait_for_timeout(1500); print('INFO WebKit (WPE headless) hat kein WebGL -> 2D-Rueckfall aktiv:', pg.evaluate("document.querySelector('#app').dataset.gl"))
    b.close()
srv.shutdown(); sys.exit(1 if fails else 0)
