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


def selftest():
    """判别性自校准：合成策略把四项判据都设成**明显偏离内置默认**的值，逐项断言其咬合。

    为什么必须有：v2.8.10 之前 `bodyFontMinPx` 因键类型不匹配被**静默丢弃**，
    声明的逐视口正文字号从未生效、一律回退写死的 17，而门禁照样报 PASS——
    「加载了策略」与「策略生效」是两件事，只有偏离默认的对照才能分辨。
    """
    import subprocess, tempfile
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="mobile-selftest-"))
    html = tmp / "fixture.html"
    # 合成样本须**同时**含四项判据的对象：正文段落、小字号表格、小字 SVG 图、小触控目标。
    html.write_text(
        "<!DOCTYPE html><html lang=zh-CN><head><meta charset=utf-8>"
        "<meta name=viewport content='width=device-width,initial-scale=1'>"
        "<style>body{font:18px/1.6 sans-serif;margin:0;padding:12px}"
        "table{font-size:12px;border-collapse:collapse}td{border:1px solid #ccc;padding:2px}"
        "a.tiny{display:inline-block;width:10px;height:10px;font-size:10px;overflow:hidden}</style></head>"
        "<body><p>合成样本：正文 18px。</p>"
        "<table><tr><td>表内 12px</td><td>2</td></tr></table>"
        "<figure><svg viewBox='0 0 640 60' width='100%'><text x='4' y='20' font-size='8'>图内 8px</text></svg></figure>"
        "<p><a class='tiny' href='#x'>点</a></p>"
        "</body></html>", encoding="utf-8")
    pol = tmp / "pol"; pol.mkdir()
    (pol / "baseline.json").write_text(json.dumps({"gates": [{"id": "mobile-readability", "config": {
        "viewports": [{"w": 375, "h": 812}],
        "criteria": {"bodyFontMinPx": {"375": 25}, "figureLabelMinEffectivePx": {"min": 30},
                     "tapTargetMinPx": 100, "tableFontMinPx": 30}}}]}, ensure_ascii=False), encoding="utf-8")
    out = tmp / "o.json"
    subprocess.run([sys.executable, __file__, "--html", str(html), "--out", str(out),
                    "--policy-dir", str(pol)], capture_output=True, text=True)
    rep = json.loads(out.read_text(encoding="utf-8"))
    v = rep["viewports"][0]
    cases = [
        ("策略被加载（policySource 非空）", rep.get("policySource") is not None),
        ("正文字号判据取自声明（25，而非内置 17）", v.get("bodyFontNeedPx") == 25),
        ("正文字号判据来源标记为 policy", v.get("bodyFontNeedSource") == "policy"),
        ("偏离默认的正文阈值真的报 FAIL", any("25" in x and "正文" in x for x in v["problems"])),
        ("图内文字阈值（30）咬合", any("30.0px" in x and "图内" in x for x in v["problems"])),
        ("触控阈值（100）咬合", any("100.0px" in x for x in v["problems"])),
        ("表内字号阈值（30）咬合", any("<30.0px" in x for x in v["problems"])),
    ]
    bad = [n for n, ok in cases if not ok]
    for n, ok in cases:
        print(f"{'ok  ' if ok else 'FAIL'} {n}")
    print(f"\n{'PASS' if not bad else 'FAIL'}: {len(cases) - len(bad)}/{len(cases)} 移动端判据来源对照按预期")
    return 0 if not bad else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html")
    ap.add_argument("--out")
    ap.add_argument("--policy-dir", default=None, help="包的 quality-policies 目录（缺省尝试 ../quality-policies）")
    ap.add_argument("--selftest", action="store_true",
                    help="判别性自校准：用**故意偏离默认**的合成策略跑一遍，断言声明的判据真的生效（判据变更后必跑）")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    if not args.html or not args.out:
        print("FAIL: 需要 --html 与 --out（或 --selftest）", file=sys.stderr)
        return 2

    target = pathlib.Path(args.html)
    if not target.is_file():
        print(f"FAIL: 找不到 --html {target}", file=sys.stderr)
        return 2
    pol_dir = args.policy_dir or str(target.resolve().parent.parent.parent / "quality-policies")
    cfg, src, adopted = load_policy(pol_dir)

    vps = cfg.get("viewports") or [{k: v[k] for k in ("w", "h")} for v in DEFAULT_VIEWPORTS]
    # 键**必须保持字符串**：下面按 body_min.get(str(vp["w"])) 查询。
    # 此前这里建的是 int 键、查询用 str 键 ⇒ 类型不匹配、每次落空 ⇒ 声明的逐视口正文字号**从未生效**，
    # 一律回退到写死的 17（2026-09-30 由交付方用「故意偏离默认的合成策略」实测发现；今天不造成假过，但是静默失守）。
    # 只收「视口宽 → 像素下限」的数值项；映射里混入的说明键（如旧的 note）必须忽略，
    # 否则解析器稍有不慎就会拿字符串去 int() 抛错。
    body_min_policy = {}
    for k, v in (cfg.get("criteria", {}).get("bodyFontMinPx") or {}).items():
        if str(k).isdigit():
            try:
                body_min_policy[str(k)] = int(v)
            except (TypeError, ValueError):
                continue
    body_min = dict(body_min_policy) or {str(v["w"]): v["bodyMin"] for v in DEFAULT_VIEWPORTS}
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

            _fallback = next((v["bodyMin"] for v in DEFAULT_VIEWPORTS if v["w"] == vp["w"]), 17)
            need = body_min.get(str(vp["w"]), _fallback)
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
                                        # 三态如实标注：policy（键来自声明）/ builtin-default（该视口未声明，取内置默认）
                                        "bodyFontNeedSource": "policy" if str(vp["w"]) in body_min_policy else "builtin-default",
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
