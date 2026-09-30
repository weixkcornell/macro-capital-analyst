#!/usr/bin/env python3
"""wind-provenance 门禁的执行工具（判据不在本文件里，在包里）。

判据来自 `quality-policies/*.json` 的 `wind-provenance` gate config。本工具把它落成**可执行**的确定性检查：

  A. 引用完整性：正文每处 Wind 引用标记（「数据来源于万得 Wind 金融数据服务」/`Wind EDB`）必须同段/同句带**指标代码**
     （Wind EDB 代码形如 S0143689 / M0014952 / 6–7 位数字），或显式标「待补」。
  B. 凭据 fail-closed：若交付物**没有** Wind 引用而使用了降级通道（公开 K 线 / 自算），
     则「方法可靠性声明」（或来源披露）**必须**出现 Wind 降级记录：同时含「Wind」与
     错误码之一（AUTH_ERROR / CREDENTIAL_MISSING）或「通道不可用」字样；且须说明已试凭据路径。
     —— 这一条就是「禁止静默降级」的可执行形态。
  C. 禁止动作：把「重装 skill/provider」写成修法、或把 `analytics_data` / `wind-alice` 写成绕过路径。
     **否定语境内的提及不算**（见下）。

用法：
  python3 scripts/check-wind-provenance.py --md out/final.md --out out/wind-provenance.json [--policy-dir <quality-policies>]
  python3 scripts/check-wind-provenance.py --selftest      # 自校准：正向 + 反向对照（判据变更后必跑）
退出码：0 = 通过／自校准全数符合预期；1 = 未通过／自校准有偏差；2 = 参数/依赖问题

校准史（这条记录本身就说明为什么必须有正向对照）：
  · v1 的 C 项用裸正则匹配，**正向对照当场 FAIL** —— 合规 md 里那句「未绕走 analytics_data / wind-alice、
    未重装 skill」被判成禁止动作。即「门要求写纪律声明，又因写了而拒绝」，该门**不可满足**，
    会把任何真实交付永久卡死。修法：仅在**非否定语境**下才判禁止动作。
"""
import argparse, json, pathlib, re, sys

WIND_MARK = re.compile(r"数据来源于万得\s*Wind|Wind\s*EDB|万得\s*Wind")
CODE = re.compile(r"\b(?:[SM]\d{6,7}|\d{6,7}(?:\.(?:SH|SZ|CSI))?)\b")
FALLBACK = re.compile(r"公开\s*K\s*线|自算|公开行情|腾讯|新浪")
ERRCODE = re.compile(r"AUTH_ERROR|CREDENTIAL_MISSING|通道不可用|凭据未配|未配置")
CREDPATH = re.compile(r"WIND_API_KEY|\.wind-aifinmarket|config\.json|环境变量")
BITEM = re.compile(r"重装\s*(?:skill|provider)|analytics_data|wind-alice")
NEG = re.compile(r"未|不|没|无|禁止|勿|切莫|never|without", re.I)
RELIABILITY_HEAD = re.compile(r"^##+\s*方法可靠性声明", re.M)


def load_policy(d):
    """入参可以是 quality-policies/ 目录，也可以是单个策略文件。

    此前**只接受目录**：传单文件会**静默回退**到内置判据且不披露 —— 与 audit-mobile.py 同一 flag
    行为不一致（2026-10-01 由复核方指出）。现两种入参都接受；调用方据 (cfg, src) 判断是否回退并必须在报告里披露。
    """
    if not d:
        return {}, None
    pp = pathlib.Path(d)
    files = (sorted(pp.glob("*.json")) if pp.is_dir() else ([pp] if pp.is_file() else []))
    for f in files:
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        for g in j.get("gates", []):
            if g.get("id") == "wind-provenance":
                return g.get("config", {}), str(f)
    return {}, None


def run_checks(md, cfg=None):
    """返回 (stats, problems)。纯函数：自校准与实跑共用同一条判据路径。

    cfg ＝ 包里 quality-policies 的 `wind-provenance.config`。**必须被真正消费**：
    此前 load_policy 读到了 cfg 却从未传进来 ⇒ 判据全是内置的（2026-09-30 由交付方实测发现），
    于是「改 baseline.json 也不生效」。下列开关均取自声明，缺省时才退回内置值。
    """
    cfg = cfg or {}
    require_code = cfg.get("requireIndicatorCode", True)
    require_err = cfg.get("requireErrorCodeInReliability", True)
    require_path = cfg.get("requireCredentialPathInReliability", True)
    problems, stats = [], {}
    paras = re.split(r"\n(?=## )", md)

    # A. 引用完整性
    wind_marks = CODE_ok = CODE_missing = 0
    miss_examples = []
    for para in paras:
        for m in WIND_MARK.finditer(para):
            wind_marks += 1
            window = para[max(0, m.start() - 220): m.end() + 220]
            if CODE.search(window) or "待补" in window:
                CODE_ok += 1
            else:
                CODE_missing += 1
                if len(miss_examples) < 3:
                    miss_examples.append(window.strip().replace("\n", " ")[:110])
    stats["windCitations"] = wind_marks
    stats["windCitationsWithCode"] = CODE_ok
    stats["windCitationsMissingCode"] = CODE_missing
    stats["cfg.requireIndicatorCode"] = require_code
    if CODE_missing and require_code:
        problems.append(f"Wind 引用缺指标代码/待补：{CODE_missing} 处 —— 例：{miss_examples[0] if miss_examples else ''}")

    # B. 凭据 fail-closed（禁止静默降级）
    uses_fallback = bool(FALLBACK.search(md))
    rel = RELIABILITY_HEAD.search(md)
    rel_block = md[rel.start():] if rel else ""
    has_wind_record = bool(WIND_MARK.search(rel_block)) or ("Wind" in rel_block)
    has_err = bool(ERRCODE.search(rel_block))
    has_path = bool(CREDPATH.search(rel_block))
    stats.update({"usesFallbackChannel": uses_fallback, "reliabilitySectionFound": bool(rel),
                  "windRecordInReliability": has_wind_record, "errorCodeInReliability": has_err,
                  "credentialPathInReliability": has_path})
    if uses_fallback and wind_marks == 0:
        if not rel:
            problems.append("使用降级通道但缺「方法可靠性声明」章节 ⇒ 无法记录 Wind 降级")
        else:
            if not has_wind_record:
                problems.append("静默降级：使用降级通道但「方法可靠性声明」未记录 Wind 通道状态")
            if not has_err and require_err:
                problems.append("静默降级：降级记录未含错误码（AUTH_ERROR / CREDENTIAL_MISSING）或「通道不可用」")
            if not has_path and require_path:
                problems.append("降级记录未说明已试凭据路径（WIND_API_KEY / ~/.wind-aifinmarket/config / config.json）")

    # C. 禁止动作——**否定语境内的提及不算**（纪律声明本身必须能写出这些词）
    flagged, negated = [], 0
    for m in BITEM.finditer(md):
        before = md[max(0, m.start() - 60): m.start()]
        if NEG.search(before):
            negated += 1
        else:
            flagged.append(m.group(0))
    bad = sorted(set(flagged))
    stats["forbiddenActionMarkers"] = bad
    stats["negatedMentionsAllowed"] = negated
    if bad:
        problems.append(f"出现禁止动作/绕过标记（非否定语境）：{bad}")

    return stats, problems


# ------------------------------------------------------------------ 自校准夹具
GOOD_DISCIPLINE = """# 产物

## 方法可靠性声明

- 数据通道状态：Wind 通道**不可用**（本机未配置凭据），错误码 `AUTH_ERROR`（`CREDENTIAL_MISSING` 为等价情形）。
- 已试凭据路径：`~/.wind-aifinmarket/config`、skill `config.json`、环境变量 `WIND_API_KEY`（三处均已检查）。
- 降级声明：宏观与总量类数字改用公开口径/镜像来源，逐项标注降级理由。
- 纪律：未重装 skill/provider，未绕走 `analytics_data` / `wind-alice`，未静默降级。
"""
FIXTURES = [
    ("positive_compliant_degradation", GOOD_DISCIPLINE, True,
     "合规降级声明（含否定语境的纪律句）必须 PASS —— v1 曾在此假阳性"),
    ("positive_wind_citation_with_code", "# 产物\n\n## 一\n\n10Y 到期收益率 1.679%（Wind EDB，中债，截至 2026-09，指标代码 S0059749）。\n\n## 方法可靠性声明\n\nWind 为主定量源。\n", True,
     "带指标代码的 Wind 引用应 PASS"),
    ("negative_silent_downgrade", "# 产物\n\n## 方法可靠性声明\n\n本报告数字来自公开 K 线自算。\n", False,
     "走降级通道却不记录 Wind 状态 = 静默降级"),
    ("negative_citation_without_code", "# 产物\n\n## 一\n\n利率 1.679%（Wind EDB，中债，截至 2026-09）。\n\n## 方法可靠性声明\n\nWind 为主源。\n", False,
     "Wind 引用缺指标代码"),
    ("negative_bypass_as_remedy", "# 产物\n\n## 方法可靠性声明\n\nWind 不可用，AUTH_ERROR（已试 ~/.wind-aifinmarket/config、config.json、环境变量 WIND_API_KEY）。修法：重装 skill 以修复凭据，或改走 analytics_data 取数。\n\n数字来自公开 K 线自算。\n", False,
     "把重装/绕过写成修法（非否定语境）"),
]


def selftest():
    ok = True
    for name, md, expect_pass, why in FIXTURES:
        _, problems = run_checks(md)
        got_pass = not problems
        mark = "ok  " if got_pass == expect_pass else "FAIL"
        if got_pass != expect_pass:
            ok = False
        print(f"{mark} {name:34s} 期望 {'PASS' if expect_pass else 'FAIL'}，实得 {'PASS' if got_pass else 'FAIL'}"
              f"  —— {why}")
        if got_pass != expect_pass and problems:
            for p in problems:
                print(f"        · {p}")
    # 附加对照（**判据来源**，2026-09-30 补）：证明「声明被真正消费」——
    # 同一份缺指标代码的产物，在声明 requireIndicatorCode=true 时 FAIL、=false 时 PASS。
    n_code = sum(1 for n, m, e, w in FIXTURES if (not run_checks(m)[1]) == e)
    fixture = "# 产物\n\n## 四、结论\n\n沪深300 收盘价 4340.76（Wind EDB，上海证券交易所，截至 2026-09）。此处**没有**指标代码。\n"
    strict = run_checks(fixture, {"requireIndicatorCode": True})[1]
    loose = run_checks(fixture, {"requireIndicatorCode": False})[1]
    policy_live = bool(strict) and not loose
    print(f"{'ok  ' if policy_live else 'FAIL'} {'判据来源：policy.requireIndicatorCode 生效':34s} 期望 声明可改变判定，"
          f"实得 strict={'FAIL' if strict else 'PASS'} / loose={'FAIL' if loose else 'PASS'}  —— 声明必须被消费，否则是纸门")
    ok = ok and policy_live
    total = len(FIXTURES) + 1
    print(f"\n{'PASS' if ok else 'FAIL'}: {n_code + (1 if policy_live else 0)}/{total} 自校准样本按预期")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--md")
    ap.add_argument("--out")
    ap.add_argument("--policy-dir", default=None)
    ap.add_argument("--selftest", action="store_true", help="跑正向+反向对照（判据变更后必跑）")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if not args.md or not args.out:
        print("FAIL: 需要 --md 与 --out（或 --selftest）", file=sys.stderr)
        return 2

    p = pathlib.Path(args.md)
    if not p.is_file():
        print(f"FAIL: 找不到 --md {p}", file=sys.stderr)
        return 2
    md = p.read_text(encoding="utf-8")
    cfg, src = load_policy(args.policy_dir or str(p.resolve().parent.parent.parent / "quality-policies"))

    stats, problems = run_checks(md, cfg)   # ← cfg 必须传入（否则声明的判据形同虚设）
    # 回退必披露：显式给了 --policy-dir 却没解析到本门 config ⇒ 记 warning，不静默
    fallback = bool(args.policy_dir) and src is None
    report = {"gate": "wind-provenance", "md": str(p), "policySource": src,
              "policyFallback": fallback,
              "warnings": (["未从 --policy-dir 解析到 wind-provenance.config ⇒ 判据走内置默认（已披露）"] if fallback else []),
              "stats": stats, "problems": problems, "verdict": "pass" if not problems else "fail"}
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"Wind 引用 {stats['windCitations']} 处（带代码/待补 {stats['windCitationsWithCode']}）｜"
          f"降级通道={stats['usesFallbackChannel']}｜可靠性声明内 Wind 记录={stats['windRecordInReliability']} "
          f"错误码={stats['errorCodeInReliability']} 凭据路径={stats['credentialPathInReliability']}"
          f"｜否定语境提及放行={stats['negatedMentionsAllowed']}")
    if problems:
        print("\n✗ wind-provenance 未通过：")
        for x in problems:
            print("   -", x)
        print(f"\n报告：{out}")
        return 1
    print(f"\nVERDICT: PASS（报告：{out}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
