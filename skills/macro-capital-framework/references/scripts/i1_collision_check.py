# -*- coding: utf-8 -*-
"""I1 门禁：摘要—正文—底座三方对撞（macro-capital-framework v2.0.2 §3.3）通用参考实现。

用法：
  python3 i1_collision_check.py --md <report.md> --pool <a.json> <b.json> ... [--out report.json]

规则：
  1. 摘要中出现的每个数值，必须同时满足：
     - 正文中出现同值（容差 tol，默认 0.5%）；
     - 底座 JSON 数值池中存在同口径同值（容差 tol）。
  2. 任一项不满足即返回非零退出码，并输出失败明细。
  3. 本脚本只做数值层三方对撞；claim 级语义对撞仍需人工/模型复核。
"""
import argparse, json, re, sys
from pathlib import Path

NUM_RE = re.compile(r'([-−–]?\d+(?:\.\d+)?)\s*(%|pp|bp|倍|亿元|亿美元|美元/桶|个交易日|个月|年|季度)')

def extract_numbers(text: str):
    out = set()
    for m in NUM_RE.finditer(text):
        try: out.add(float(m.group(1).replace('−','-').replace('–','-')))
        except ValueError: pass
    for m in re.finditer(r'(?<![\d.])([-−–]?\d+\.\d+)(?![\d])', text):
        try: out.add(float(m.group(1).replace('−','-').replace('–','-')))
        except ValueError: pass
    return out

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

def close(a,b,tol):
    return abs(a-b) <= abs(a)*tol + 1e-9 or abs(a-b) < 0.0051

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--md', required=True)
    ap.add_argument('--pool', nargs='*', default=[])
    ap.add_argument('--out')
    ap.add_argument('--tol', type=float, default=0.005)
    ap.add_argument('--summary-heading', default=None,
                    help='摘要章节标题前缀；缺省取第一个二级标题（## ...）')
    args = ap.parse_args()

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
    for f in args.pool:
        p = Path(f)
        if not p.exists():
            print(f'WARN: 底座文件不存在，跳过 {p}', file=sys.stderr)
            continue
        for v, key in walk_numeric(json.loads(p.read_text(encoding='utf-8'))):
            pool.setdefault(v, []).append(f'{p.name}{key}')

    sn = sorted(extract_numbers(summary))
    bn = extract_numbers(body)
    rows = []
    fails = []
    for x in sn:
        in_body = any(close(x, y, args.tol) for y in bn)
        hits = [(v, keys) for v, keys in pool.items() if close(x, v, args.tol)]
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
