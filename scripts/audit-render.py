#!/usr/bin/env python3
"""render-overflow 门禁的执行工具（判据不在本文件里，在包里）。

口径全部来自 `quality-policies/*.json` 的 `render-overflow` gate config：
  · viewports        —— 要测哪几档视口
  · overflowCriterion—— 什么算溢出（页面级 + 元素级两条）
  · contrastStandard —— WCAG AA 阈值（正文 4.5:1 / 大字 3.0:1）
  · coverage         —— 全节点穷举，禁止抽样

用法：
  python3 scripts/audit-render.py --html out/index.html --out out/render-audit.json
退出码：0 = 通过；1 = 有溢出或对比度失败；2 = 参数/依赖问题
"""
import argparse, json, pathlib, re, sys

def load_criterion(pack_root):
    import glob, os
    for f in glob.glob(os.path.join(pack_root, 'quality-policies', '*.json')):
        d = json.load(open(f, encoding='utf-8'))
        for g in d.get('gates', []):
            if g.get('id') == 'render-overflow':
                return g.get('config') or {}
    return None

OVERFLOW_JS = r"""
() => {
  const vw = window.innerWidth, de = document.documentElement;
  const horiz = de.scrollWidth - de.clientWidth;
  const bad = [];
  const srOnly = (el, cs, r) => {
    // 无障碍隐藏元素（.sr-only 一类）：本就该被裁掉，不算溢出
    if (/(^|\s)(sr-only|visually-hidden|a11y-hidden|screen-reader-only)(\s|$)/.test((el.className||'').toString())) return true;
    return cs.position === 'absolute' && (cs.clip && cs.clip !== 'auto' || cs.clipPath && cs.clipPath !== 'none')
           && r.width <= 2 && r.height <= 2;
  };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (srOnly(el, cs, r)) continue;
    if (el.scrollWidth - el.clientWidth > 1 && !['visible','auto','scroll'].includes(cs.overflowX)) {
      bad.push({kind: 'clipped', tag: el.tagName.toLowerCase(),
                cls: (el.className || '').toString().slice(0, 60),
                clipped: el.scrollWidth - el.clientWidth,
                text: (el.textContent || '').trim().slice(0, 50)});
    }
  }
  return {viewport: vw, pageScrollWidth: de.scrollWidth, pageClientWidth: de.clientWidth,
          horizontalOverflowPx: horiz, problems: bad};
}
"""

CONTRAST_JS = r"""
() => {
  const lum = (rgb) => { const f = c => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
    return 0.2126*f(rgb[0]) + 0.7152*f(rgb[1]) + 0.0722*f(rgb[2]); };
  const parse = s => { const m = (s||'').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x)); return {rgb: p.slice(0,3), a: p.length > 3 ? p[3] : 1}; };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05); };
  const bgOf = el => { let n = el;
    while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.95) return c.rgb; n = n.parentElement; }
    return [255,255,255]; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const direct = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    if (!direct) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    const r = ratio(fg.rgb, bg);
    out.push({tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,60),
              text: direct.slice(0,40), fontSize: size, weight,
              fg: cs.color, bg: 'rgb(' + bg.join(',') + ')',
              ratio: Math.round(r * 100) / 100, required: need, pass: r >= need - 0.005});
  }
  return out;
}
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--html', required=True)
    ap.add_argument('--out')
    ap.add_argument('--pack-root', default=str(pathlib.Path(__file__).resolve().parent.parent))
    a = ap.parse_args()

    crit = load_criterion(a.pack_root)
    if not crit:
        print('FAIL: 找不到 render-overflow 门禁的 config（判据必须来自包里）', file=sys.stderr); return 2
    viewports = [(v['w'], v['h']) for v in crit.get('viewports', [])]
    if not viewports:
        print('FAIL: 门禁 config 没给 viewports', file=sys.stderr); return 2
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(f'FAIL: 需要 playwright（{e}）', file=sys.stderr); return 2

    path = pathlib.Path(a.html).resolve()
    result = {'gate': 'render-overflow', 'html': str(path), 'bytes': path.stat().st_size,
              'criterion_from_pack': crit, 'viewports': [], 'contrast': {}}

    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h in viewports:
            pg = b.new_page(viewport={'width': w, 'height': h})
            pg.goto(path.as_uri()); pg.wait_for_timeout(150)
            result['viewports'].append({'w': w, 'h': h, **pg.evaluate(OVERFLOW_JS)})
            pg.close()
        pg = b.new_page(viewport={'width': 1280, 'height': 900})
        pg.goto(path.as_uri()); pg.wait_for_timeout(150)
        tc = pg.evaluate(CONTRAST_JS)
        b.close()

    fails = [x for x in tc if not x['pass']]
    result['contrast'] = {'total_text_nodes': len(tc), 'passed': len(tc) - len(fails),
                          'failed': len(fails), 'failures': fails[:40]}
    overflowing = [v for v in result['viewports'] if v['problems'] or v['horizontalOverflowPx'] > 1]
    result['verdict'] = 'pass' if (not overflowing and not fails) else 'fail'
    if a.out:
        pathlib.Path(a.out).write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"render-overflow：{path.name}（{result['bytes']} B）｜口径来自包（{len(viewports)} 档视口）")
    for v in result['viewports']:
        print(f"  视口 {v['w']}×{v['h']}：页面横溢 {v['horizontalOverflowPx']}px，元素问题 {len(v['problems'])}")
    c = result['contrast']
    print(f"  对比度：{c['passed']}/{c['total_text_nodes']} 通过，{c['failed']} 失败（WCAG AA，全节点穷举）")
    print('  VERDICT:', result['verdict'].upper())
    return 0 if result['verdict'] == 'pass' else 1

if __name__ == '__main__':
    sys.exit(main())
