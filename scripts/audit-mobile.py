#!/usr/bin/env python3
"""mobile-readability 门禁的执行工具（判据不在本文件里，在包里）。

判据全部来自 `quality-policies/*.json` 的 `mobile-readability` gate config：
  · viewports            —— 测哪几档移动视口（默认 320×800 / 375×812 / 390×844）
  · criteria.bodyFontMinPx      —— 正文计算字号下限（375 → 17px，320 → 16px）
  · criteria.figureLabelMinEffectivePx —— 图内文字**等效字号**下限（= font-size × 视口宽/viewBox 宽），
                                        或存在放大大口（aria-label/id/class 含 放大/zoom/fullscreen 等）
  · criteria.tapTargetMinPx     —— 可点目标最小边长
  · criteria.tablePolicy        —— 允许容器内横滚，页面级必须 0 溢出；表内字号下限
  · criteria.overflow           —— 页面级 scrollWidth − clientWidth ≤ 1px；元素裁切/重叠 = 0
  · criteria.contrast           —— 本工具不重复做对比度（由 audit-render.py 的全节点穷举承担）

用法：
  python3 scripts/audit-mobile.py --html out/index.html --out out/mobile-audit.json
退出码：0 = 全过；1 = 有硬项未过；2 = 参数/依赖问题
"""
import argparse, json, pathlib, re, sys

DEFAULT_VIEWPORTS = [{"w": 320, "h": 800, "bodyMin": 16}, {"w": 375, "h": 812, "bodyMin": 17}, {"w": 390, "h": 844, "bodyMin": 17}]
ZOOM_HINT = re.compile(r"放大|全屏|zoom|fullscreen|expand|enlarge|lightbox", re.I)


def load_policy(policy_path):
    """从包的 quality-policies/*.json 读判据；读不到则用内置默认（并在报告里声明 adopted_defaults）。"""
    cfg, src, adopted = {}, None, []
    # 入参既可能是 quality-policies/ 目录（audit-delivery.sh 传的就是目录），也可能是单个策略文件。
    # 此前只判 is_file() ⇒ 传目录时恒为假 ⇒ 声明的判据**永不加载**、一律走内置默认（2026-09-30 由交付方实测发现）。
    _pp = pathlib.Path(policy_path) if policy_path else None
    _files = (sorted(_pp.glob("*.json")) if (_pp and _pp.is_dir())
              else ([_pp] if (_pp and _pp.is_file()) else []))
    if _files:
        for f in _files:
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            for g in d.get("gates", []):
                if g.get("id") == "mobile-readability":
                    cfg, src = g.get("config", {}), str(f)
    if not cfg:
        adopted.append("未找到 mobile-readability 策略 ⇒ 采用内置默认阈值")
    return cfg, src, adopted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--policy-dir", default=None, help="包的 quality-policies 目录（缺省尝试 ../quality-policies）")
    args = ap.parse_args()

    target = pathlib.Path(args.html)
    if not target.is_file():
        print(f"FAIL: 找不到 --html {target}", file=sys.stderr)
        return 2
    pol_dir = args.policy_dir or str(target.resolve().parent.parent.parent / "quality-policies")
    cfg, src, adopted = load_policy(pol_dir)

    vps = cfg.get("viewports") or [{k: v[k] for k in ("w", "h")} for v in DEFAULT_VIEWPORTS]
    body_min = {int(k): int(v) for k, v in (cfg.get("criteria", {}).get("bodyFontMinPx") or {}).items()
                if str(k).isdigit()}
    if not body_min:
        body_min = {str(v["w"]): v["bodyMin"] for v in DEFAULT_VIEWPORTS}
    fig_min = float(cfg.get("criteria", {}).get("figureLabelMinEffectivePx", {}).get("min", 11))
    tap_min = float(cfg.get("criteria", {}).get("tapTargetMinPx", 44))
    table_min_font = float(cfg.get("criteria", {}).get("tableFontMinPx", 14))

    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:  # pragma: no cover
        print(f"FAIL: 需要 playwright（{e}）", file=sys.stderr)
        return 2

    report = {"gate": "mobile-readability", "html": str(target), "policySource": src,
              "adoptedDefaults": adopted, "viewports": [], "problems": []}

    with sync_playwright() as p:
        b = p.chromium.launch()
        for vp in vps:
            pg = b.new_page(viewport={"width": vp["w"], "height": vp["h"]}, device_scale_factor=2)
            pg.goto("file://" + str(target.resolve()))
            pg.wait_for_timeout(350)
            res = pg.evaluate(
                """(args) => {
                    const [vpW, figMin, tapMin, tableMin] = args;
                    const ZOOM = /放大|全屏|zoom|fullscreen|expand|enlarge|lightbox/i;
                    // sr-only（无障碍视觉隐藏）——与 render-overflow 判据的显式排除保持一致：
                    // position:absolute/fixed + clip/clip-path + 尺寸 ≤2px 的元素本就该被裁掉、
                    // 也不应计入触控目标（否则每个视口都会误报 1 个「跳到正文」链接——包内已有此记录）。
                    const isSrOnly = (el, cs, r) => {
                        const pos = cs.position === 'absolute' || cs.position === 'fixed';
                        const clipped = cs.clip && cs.clip !== 'auto' || cs.clipPath && cs.clipPath !== 'none';
                        return pos && clipped && r.width <= 2 && r.height <= 2;
                    };
                    const out = {page: {}, body: {}, figures: [], taps: [], tables: []};
                    const de = document.documentElement;
                    out.page.scrollWidth = de.scrollWidth; out.page.clientWidth = de.clientWidth;
                    out.page.overflowPx = de.scrollWidth - de.clientWidth;
                    // 元素级裁切/重叠：只查"会被裁掉内容"的元素（overflowX 不可滚动且 scrollWidth>clientWidth）
                    let clipped = 0, overlap = 0;
                    const all = [...document.querySelectorAll('*')];
                    for (const el of all) {
                        const cs = getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        if (isSrOnly(el, cs, rect)) continue;   // 无障碍隐藏元素：不算裁切
                        if (el.scrollWidth - el.clientWidth > 1 && !['visible','auto','scroll'].includes(cs.overflowX)) clipped++;
                        if (rect.width > 0 && rect.right > vpW + 1 && !['visible','auto','scroll'].includes(cs.overflowX)
                            && cs.position !== 'fixed') overlap++;
                    }
                    out.page.clipped = clipped; out.page.overflowingElements = overlap;
                    // 正文计算字号：取 <p> 的中位字号
                    const ps = [...document.querySelectorAll('p')].map(e => parseFloat(getComputedStyle(e).fontSize)).filter(x => x > 0);
                    ps.sort((a,b)=>a-b);
                    out.body.pCount = ps.length;
                    out.body.medianFontPx = ps.length ? ps[Math.floor(ps.length/2)] : null;
                    out.body.minFontPx = ps.length ? ps[0] : null;
                    // 图：SVG 内 text 的等效字号
                    for (const fig of document.querySelectorAll('figure')) {
                        const svg = fig.querySelector('svg');
                        if (!svg) { continue; }
                        const vb = (svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
                        const svgW = svg.getBoundingClientRect().width;
                        const scale = (vb.length === 4 && vb[2] > 0 && svgW > 0) ? (svgW / vb[2]) : null;
                        let worst = Infinity, n = 0;
                        for (const t of svg.querySelectorAll('text')) {
                            const fs = parseFloat(getComputedStyle(t).fontSize);
                            if (!isFinite(fs)) continue;
                            n++;
                            const eff = scale === null ? fs : fs * scale;
                            if (eff < worst) worst = eff;
                        }
                        const zoom = ZOOM.test((fig.getAttribute('aria-label')||'') + ' ' + fig.innerHTML.slice(0, 4000));
                        out.figures.push({label: (fig.querySelector('.fig-eyebrow')||{}).textContent || '',
                                          textNodes: n, worstEffectivePx: isFinite(worst) ? +worst.toFixed(2) : null,
                                          hasZoomAffordance: zoom, svgWidthPx: +svgW.toFixed(1)});
                    }
                    // 触控目标：目录/脚注/按钮类可点元素
                    const clickable = [...document.querySelectorAll('nav a, .rail a, .toc a, .toc-mobile a, footer a, button, summary, a[href^="#"]')];
                    const seen = new Set();
                    for (const el of clickable) {
                        const r = el.getBoundingClientRect();
                        if (r.width === 0 || r.height === 0) continue;
                        if (isSrOnly(el, getComputedStyle(el), r)) continue;   // 无障碍 skip-link 不计入触控目标
                        const key = r.top + ':' + r.left + ':' + (el.textContent||'').slice(0,12);
                        if (seen.has(key)) continue; seen.add(key);
                        out.taps.push({tag: el.tagName.toLowerCase(), text: (el.textContent||'').trim().slice(0,18),
                                       w: +r.width.toFixed(1), h: +r.height.toFixed(1)});
                    }
                    // 表：容器是否可横滚、表内字号
                    for (const tbl of document.querySelectorAll('table')) {
                        const cs = getComputedStyle(tbl);
                        const fsz = parseFloat(cs.fontSize);
                        let scroller = tbl.parentElement, canScroll = false;
                        while (scroller && scroller !== document.body) {
                            const scs = getComputedStyle(scroller);
                            if (['auto','scroll'].includes(scs.overflowX)) { canScroll = true; break; }
                            scroller = scroller.parentElement;
                        }
                        const firstTh = tbl.querySelector('th');
                        const firstSticky = firstTh ? (getComputedStyle(firstTh).position === 'sticky') : false;
                        const stacked = getComputedStyle(tbl).display !== 'table';
                        out.tables.push({rows: tbl.querySelectorAll('tr').length, fontPx: fsz,
                                         containerScrollsX: canScroll, firstColSticky: firstSticky, stackedLayout: stacked});
                    }
                    out.thresholds = {tableMin};
                    return out;
                }""",
                [vp["w"], fig_min, tap_min, table_min_font],
            )
            pg.close()

            need = body_min.get(str(vp["w"]), 17)
            probs = []
            if res["page"]["overflowPx"] > 1:
                probs.append(f"页面级横向溢出 {res['page']['overflowPx']}px（判据 ≤1px）")
            if res["page"]["clipped"] > 0:
                probs.append(f"元素裁切 {res['page']['clipped']} 处")
            if res["page"]["overflowingElements"] > 0:
                probs.append(f"元素越界 {res['page']['overflowingElements']} 处")
            if res["body"]["medianFontPx"] is not None and res["body"]["medianFontPx"] < need:
                probs.append(f"正文中位字号 {res['body']['medianFontPx']}px < {need}px")
            for f in res["figures"]:
                if f["worstEffectivePx"] is not None and f["worstEffectivePx"] < fig_min and not f["hasZoomAffordance"]:
                    probs.append(f"图内文字等效字号 {f['worstEffectivePx']}px < {fig_min}px 且无放大大口（{(f['label'] or '')[:26]}）")
            small_taps = [t for t in res["taps"] if min(t["w"], t["h"]) < tap_min]
            if small_taps:
                probs.append(f"可点目标 <{tap_min}px：{len(small_taps)} 个（例 {small_taps[0]['tag']}「{small_taps[0]['text']}」{small_taps[0]['w']}×{small_taps[0]['h']}）")
            bad_tbl = [t for t in res["tables"] if t["fontPx"] < table_min_font]
            if bad_tbl:
                probs.append(f"表内字号 <{table_min_font}px：{len(bad_tbl)} 张")
            unscrollable = [t for t in res["tables"] if not t["containerScrollsX"] and not t["stackedLayout"]]
            if unscrollable:
                probs.append(f"表格既非卡片堆叠也无可横滚容器：{len(unscrollable)} 张")

            report["viewports"].append({"viewport": f"{vp['w']}x{vp['h']}", "bodyFontNeedPx": need,
                                        "bodyMedianFontPx": res["body"]["medianFontPx"],
                                        "pageOverflowPx": res["page"]["overflowPx"],
                                        "clipped": res["page"]["clipped"],
                                        "figures": res["figures"], "tableCount": len(res["tables"]),
                                        "tapTargets": len(res["taps"]), "problems": probs})
            report["problems"].extend([f"{vp['w']}x{vp['h']}: {p}" for p in probs])
        b.close()

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    report["verdict"] = "pass" if not report["problems"] else "fail"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    for v in report["viewports"]:
        print(f"视口 {v['viewport']}：正文中位字号 {v['bodyMedianFontPx']}px（需 ≥{v['bodyFontNeedPx']}）"
              f"｜页面横溢 {v['pageOverflowPx']}px｜裁切 {v['clipped']}｜表 {v['tableCount']} 张｜可点 {v['tapTargets']}")
        for f in v["figures"]:
            print(f"   · 图 {(f['label'] or '')[:30]:32s} 文字节点 {f['textNodes']:3d}｜最差等效字号 {f['worstEffectivePx']}px"
                  f"｜放大口 {'有' if f['hasZoomAffordance'] else '无'}")
    if report["problems"]:
        print("\n✗ mobile-readability 未通过：")
        for p in report["problems"]:
            print("   -", p)
        print(f"\n报告：{out}")
        return 1
    print(f"\nVERDICT: PASS（报告：{out}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
