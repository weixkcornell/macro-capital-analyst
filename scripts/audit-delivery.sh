#!/usr/bin/env bash
# 交付级门禁总跑（一条命令跑完包里与"产物"相关的硬门）。
#
# 为什么需要：包里声明了 10 道门禁，但此前只有"包自身"的检查（check-pack）有入口，
# 产物侧的门禁散在各处、没有统一跑法 —— 于是"门禁跑过了"这句话取决于执行者记得跑哪几个。
#
# 用法：
#   scripts/audit-delivery.sh --md <final.md> --html <index.html> \
#                             --template <output-templates/x.json> --pool <data-base.json> [--out <dir>]
# 退出码：0 = 全部硬门通过；1 = 有硬门未过；2 = 参数/依赖问题
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACK="$(cd "$HERE/.." && pwd)"
MD=""; HTML=""; TPL=""; POOL=""; OUT="$PACK/engine/delivery-audit"
while [ $# -gt 0 ]; do
  case "$1" in
    --md) MD="$2"; shift 2;;
    --html) HTML="$2"; shift 2;;
    --template) TPL="$2"; shift 2;;
    --pool) POOL="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) echo "未知参数：$1"; exit 2;;
  esac
done
[ -n "$MD" ] && [ -n "$TPL" ] || { echo "用法：audit-delivery.sh --md <final.md> --template <tpl.json> [--html <index.html>] [--pool <base.json>]"; exit 2; }
mkdir -p "$OUT"

rc=0
say() { printf '\n── %s\n' "$1"; }

# ① 数字三方对撞（摘要—正文—底座）：number-consistency 的可执行形态
if [ -n "$POOL" ]; then
  say "① number-consistency：摘要—正文—底座三方对撞（i1）"
  python3 "$PACK/skills/macro-capital-framework/references/scripts/i1_collision_check.py" \
      --md "$MD" --pool $POOL --out "$OUT/i1-collision.json" >/dev/null 2>"$OUT/i1-stderr.txt"
  code=$?
  python3 - "$OUT/i1-collision.json" <<'PY' || rc=1
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print(f"   checked={d['summary_numbers_checked']} passed={d['summary_numbers_passed']} verdict={d['verdict']}")
print("   caliber:", json.dumps(d.get('caliber',{}),ensure_ascii=False)[:200])
sys.exit(0 if d['verdict']=='pass' else 1)
PY
  [ $code -eq 0 ] || { echo "   ✗ i1 未通过（详见 $OUT/i1-collision.json）"; rc=1; }
else
  say "① number-consistency：未提供 --pool，跳过（此项必须有底座，不得跳过发布）"
  rc=1
fi

# ② section-outline：章节齐备与顺序（判据来自包里）
say "② section-outline：章节对照输出模板"
node "$PACK/scripts/check-sections.mjs" --target "$MD" --template "$TPL" || rc=1
[ -n "$HTML" ] && { node "$PACK/scripts/check-sections.mjs" --target "$HTML" --template "$TPL" >/dev/null || { echo "   ✗ HTML 章节不符（md 已过，说明渲染丢章节）"; rc=1; }; }

# ③ placeholder-clean：占位符残留（记法「【替换：…】」不计，写了具体内容才算）
say "③ placeholder-clean：占位符残留 + 未注入空值（None/nan/inf）"
python3 - "$MD" "$HTML" <<'PY' || rc=1
import re,sys
bad=0
for f in [p for p in sys.argv[1:] if p]:
    s=open(f,encoding='utf-8').read()
    ph=[m.group(0) for m in re.finditer(r'【替换：([^】]*)】', s)
        if m.group(1) not in ('','…') and not re.search(r'[()\[\]{}\\*+?|^$.]', m.group(1)) and not re.match(r'^[<＜].*[>＞]$', m.group(1))]
    # 未注入空值：只在**紧邻数字/单位/百分号**时判——避免把英文散文里的 "None"/"inf" 误报
    # （数字一致性门禁只核对数字，抓不到 None；本条是它的补位）
    nul=[m.group(0) for m in re.finditer(r'\b(None|nan|NaN|inf|Infinity)\b\s*(%|pp|bp|倍|亿|万亿|元|点|pct)?', s)
         if re.search(r'%|pp|bp|倍|亿|万亿|元|点|pct', m.group(0)) or re.search(r'\b(None|nan|NaN|inf|Infinity)\b\s*[，。、）)]', s[max(0,m.start()-40):m.end()+40]) and re.search(r'\d', s[max(0,m.start()-40):m.start()])]
    print(f"   {f}: 占位残留 {len(ph)} 处｜未注入空值 {len(nul)} 处" + (f" → {ph[:3]} {nul[:3]}" if (ph or nul) else ""))
    bad += len(ph)+len(nul)
sys.exit(1 if bad else 0)
PY

# ④ banned-tokens：禁例 token 0 命中（豁免表与 review 表来自包里）
say "④ banned-tokens：禁例 token 扫描（摘引域/代码块内不计）"
python3 - "$PACK" "$MD" "$HTML" <<'PY' || rc=1
import json,glob,re,sys
pack, targets = sys.argv[1], [p for p in sys.argv[2:] if p]
cfg={}
for f in glob.glob(pack+'/quality-policies/*.json'):
    d=json.load(open(f,encoding='utf-8'))
    for g in d.get('gates',[]):
        if g.get('id')=='banned-tokens': cfg=g.get('config',{})
tokens=cfg.get('bannedTokens',[]); allow=set(cfg.get('bannedTokensAllowlist',[]))
text=''
for t in targets: text+=open(t,encoding='utf-8').read()
# 引述域与代码块豁免：反引号/中文引号内的"提及"、``` 代码块内的记法
text=re.sub(r'```[\s\S]*?```','',text)
text=re.sub(r'`[^`]*`','',text)
text=re.sub(r'「[^」]*」','',text); text=re.sub(r'『[^』]*』','',text)
hits=[]
for tok in tokens:
    if tok in allow: continue
    n=text.count(tok)
    if n: hits.append((tok,n))
print(f"   扫描 {len(tokens)} 个禁例 token（豁免 {len(allow)} 个）：命中 {len(hits)} 类")
for t,n in hits[:10]: print(f"      ! {t} × {n}")
sys.exit(1 if hits else 0)
PY

# ⑤ render-overflow：五档视口 + WCAG AA 全节点穷举（判据来自包里）
if [ -n "$HTML" ]; then
  say "⑤ render-overflow：渲染溢出与对比度"
  python3 "$PACK/scripts/audit-render.py" --html "$HTML" --out "$OUT/render-audit.json" || rc=1
else
  say "⑤ render-overflow：未提供 --html，跳过"
fi

say "汇总"
if [ "$rc" -eq 0 ]; then echo "✓ 交付级门禁全部通过（报告见 $OUT/）"; else echo "✗ 有硬门未通过 —— 不得发布（详见 $OUT/）"; fi
exit "$rc"
