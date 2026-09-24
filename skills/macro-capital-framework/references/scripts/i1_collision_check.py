# -*- coding: utf-8 -*-
"""I1 门禁：摘要—正文—底座三方对撞（macro-capital-framework v2.0.2 §3.3）通用参考实现。

用法：
  python3 i1_collision_check.py --md <report.md> --pool <a.json> <b.json> ... [--out report.json]
  python3 i1_collision_check.py --selftest      # 只跑解析层自检，不读任何报告

规则：
  1. 摘要中出现的每个数值，必须同时满足：
     - 正文中出现同值（容差 tol，默认 0.5%）；
     - 底座 JSON 数值池中存在同口径同值（容差 tol）。
  2. 任一项不满足即返回非零退出码，并输出失败明细。
  3. 本脚本只做数值层三方对撞；claim 级语义对撞仍需人工/模型复核。

容差口径（必须显式声明，否则同一份报告在不同口径下会得到不同结论）：
  close(a,b,tol) = |a-b| <= |a|*tol + 1e-9  或  |a-b| < 0.0051
  —— 前一项是【相对容差】，后一项是【绝对下限】。两者混用时，小数值的实际容差
  比大数值宽（如 t=0.31 时 0.0051 相当 1.6%，而 tol=0.5%）。这是刻意的：
  报告里存在大量两位小数读数，纯相对容差会因四舍五入而误报。改动 tol 或 0.0051
  即改变门禁结论，须与产物一并记录。

解析层已知边界（v2.4.1 修）：
  - 指数名吞数字：`沪深300 年化超额` 曾被解析成「300 + 单位 年」；
  - 千分位：`16,143.03` 曾被截成 `143.03`（旧式 `\d+\.\d+` 从逗号后起匹配）；
  - 这些边界由下方的 --selftest 覆盖（含负向样本），改解析器必须同时跑它。
"""
import argparse, json, re, sys
from pathlib import Path

# 指数名前缀负向后视：避免把「沪深300 年化超额」解析成「数字 300 + 单位 年」。
# 仅当数字紧跟在指数名前缀之后时排除；带空格或量词的正常计量不受影响。
_IDX_PREFIX = r'(?<!\d)(?<![\d,])(?<!沪深)(?<!中证)(?<!上证)(?<!深证)(?<!国证)(?<!科创)'
NUM_RE = re.compile(_IDX_PREFIX + r'([-−–]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%|pp|bp|倍|亿元|亿美元|美元/桶|个交易日|个月|年|季度)')
BARE_RE = re.compile(r'(?<![\d.,])([-−–]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d+)(?![\d])')


def _to_float(text: str) -> float:
    """Parse one extracted literal, tolerating thousands separators and unicode minus."""
    return float(text.replace('−', '-').replace('–', '-').replace(',', ''))


def extract_numbers(text: str):
    out = set()
    for m in NUM_RE.finditer(text):
        try: out.add(_to_float(m.group(1)))
        except ValueError: pass
    for m in BARE_RE.finditer(text):
        try: out.add(_to_float(m.group(1)))
        except ValueError: pass
    return out

# 解析层自检样本：正向（必须取到）+ 负向（必须不取到）。负向样本取自本轮实测缺陷。
SELFTEST = [
    ('沪深300 年化超额 t = 0.31',                      {0.31}),
    ('沪深300 的 PE 为 12.5 倍',                        {12.5}),
    ('中证红利全样本年化超额 t = 0.31（月度 0.27）',      {0.31, 0.27}),
    ('两市成交额 16,143.03 亿元',                       {16143.03}),
    ('多空年化 −2.35 bp、季度 +16.8bp',                 {-2.35, 16.8}),
    ('样本 6.7 年、回撤 −12.4%',                        {6.7, -12.4}),
    ('科创50 指数、上证50 指数',                         set()),          # 指数名不是计量
    ('三年前、2026-09-15',                              set()),          # 无单位整数与日期不取
]


def run_selftest(verbose=True):
    """解析层双向校准：正向必须全取到，负向必须一个都不多取。"""
    bad = 0
    for text, expected in SELFTEST:
        got = extract_numbers(text)
        ok = got == expected
        if not ok:
            bad += 1
        if verbose:
            mark = 'ok  ' if ok else 'FAIL'
            print(f'{mark} {text!r} -> {sorted(got)}  (期望 {sorted(expected)})')
    if verbose:
        print(f'\n{"PASS" if bad == 0 else "FAIL"}: {len(SELFTEST) - bad}/{len(SELFTEST)} 自检样本通过')
    return 0 if bad == 0 else 1


def walk_numeric(obj, path=''):
    out = []
    if isinstance(obj, dict):
        for k,v in obj.items(): out.extend(walk_numeric(v, path+'/'+str(k)))
    elif isinstance(obj, list):
        for i,v in enumerate(obj): out.extend(walk_numeric(v, path+f'[{i}]'))
    else:
        if isinstance(obj,(int,float)) and not isinstance(obj,bool):
            out.append((float(obj), path))
    return out

def close(a, b, tol, abs_tol=0.0051):
    """同值判定：相对容差（以 a 为基准）或绝对下限。

    ⚠ 口径（改动即改门禁结论，故写进函数并逐条写进报告 caliber）：
      |a-b| <= |a|*tol + 1e-9  或  |a-b| < abs_tol
    - 相对项以【左值 a】为基准 ⇒ **不对称**（a 小 b 大时更宽松）。保持原行为，不静默改语义。
    - abs_tol 原为硬编码 0.0051，现由 --abs-tol 暴露，默认值不变。
    - 池侧默认不做键过滤：底座 JSON 内【所有】数值（含版本号/计数/日期）都进池 ⇒ 存在弱匹配风险，
      可用 --pool-exclude 排除（如 --pool-exclude 'version|count|date|Rev'）。首单实测 0/47 未爆。
    """
    return abs(a-b) <= abs(a)*tol + 1e-9 or abs(a-b) < abs_tol

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--md')
    ap.add_argument('--pool', nargs='*', default=[])
    ap.add_argument('--out')
    ap.add_argument('--selftest', action='store_true',
                    help='只跑解析层自检（正向+负向样本），不读取任何报告')
    ap.add_argument('--tol', type=float, default=0.005,
                    help='相对容差（以摘要值为基准，默认 0.5%%）')
    ap.add_argument('--abs-tol', dest='abs_tol', type=float, default=0.0051,
                    help='绝对容差下限（默认 0.0051；原为硬编码，改动即改门禁结论）')
    ap.add_argument('--pool-exclude', dest='pool_exclude', default=None,
                    help='正则：底座 JSON 中键路径命中该模式的数值不进池（用于排除版本号/计数/日期类弱匹配）')
    ap.add_argument('--summary-heading', default=None,
                    help='摘要章节标题前缀；缺省取第一个二级标题（## ...）')
    args = ap.parse_args()

    if args.selftest:
        return run_selftest()
    if not args.md:
        ap.error('--md 为必填（除非使用 --selftest）')

    md = Path(args.md).read_text(encoding='utf-8')
    parts = re.split(r'\n(?=## )', md)
    h2 = [p for p in parts if p.startswith('## ')]
    if not h2:
        print('FAIL: 未找到二级标题章节', file=sys.stderr); return 2
    if args.summary_heading:
        cand = [p for p in h2 if p.split('\n',1)[0].startswith('## '+args.summary_heading.strip())]
        if not cand:
            print(f'FAIL: 未找到摘要章节 {args.summary_heading!r}', file=sys.stderr); return 2
        summary = cand[0]
    else:
        summary = h2[0]
    body = '\n'.join(p for p in h2 if p is not summary)

    pool = {}
    pool_excluded = 0
    ex = re.compile(args.pool_exclude) if args.pool_exclude else None
    for f in args.pool:
        p = Path(f)
        if not p.exists():
            print(f'WARN: 底座文件不存在，跳过 {p}', file=sys.stderr)
            continue
        for v, key in walk_numeric(json.loads(p.read_text(encoding='utf-8'))):
            if ex and ex.search(key):
                pool_excluded += 1
                continue
            pool.setdefault(v, []).append(f'{p.name}{key}')

    sn = sorted(extract_numbers(summary))
    bn = extract_numbers(body)
    rows = []
    fails = []
    for x in sn:
        in_body = any(close(x, y, args.tol, args.abs_tol) for y in bn)
        hits = [(v, keys) for v, keys in pool.items() if close(x, v, args.tol, args.abs_tol)]
        in_pool = bool(hits)
        ok = in_body and in_pool
        row = {
            'value': x,
            'in_body': in_body,
            'in_pool': in_pool,
            'pool_matches': [{'value': v, 'keys': keys[:3]} for v, keys in hits[:3]],
        }
        rows.append(row)
        if not ok:
            fails.append(row)

    report = {
        'gate': 'I1 摘要—正文—底座三方对撞',
        'md': str(args.md),
        'summary_heading': summary.split('\n',1)[0],
        'summary_numbers_checked': len(sn),
        'summary_numbers_passed': len(sn) - len(fails),
        'verdict': 'pass' if not fails else 'fail',
        # 口径三条：容差怎么算、池里放了什么、排除了什么。缺任一条，本门禁的 PASS 都不可复核。
        'caliber': {
            'tolerance': f'|a-b| <= |a|*{args.tol} + 1e-9 或 |a-b| < {args.abs_tol}（相对项以摘要值为基准，不对称）',
            'pool': f'{len(pool)} 个不同数值，来自 {len(args.pool)} 个底座文件；口径＝底座 JSON 内【全部】数值（含版本号/计数/日期）',
            'pool_exclude': args.pool_exclude or None,
            'pool_excluded_values': pool_excluded,
            'summary_selector': '指定 --summary-heading，缺省取第一个二级标题',
        },
        'detail': rows,
    }
    text = json.dumps(report, ensure_ascii=False, indent=1)
    if args.out:
        Path(args.out).write_text(text, encoding='utf-8')
    print(text)
    if fails:
        print(f'FAIL: {len(fails)}/{len(sn)} 个摘要数值未通过三方对撞', file=sys.stderr)
        return 1
    print(f'PASS: {len(sn)}/{len(sn)} 个摘要数值通过三方对撞')
    return 0

if __name__ == '__main__':
    sys.exit(main())
