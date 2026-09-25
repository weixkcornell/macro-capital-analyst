#!/usr/bin/env bash
# 发布前四件套：一条命令跑完，任一失败即非零退出。
# 用法：scripts/release-check.sh
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
rc=0
run() { echo "── $1"; shift; "$@" || { echo "   ✗ 失败"; rc=1; }; }

run "① 包自检 check-pack（版本 lockstep／doc lockstep／digest 可复现／占位符／fileRef 安全／bannedTokens 阈值）" \
    node scripts/check-pack.mjs
run "② 门禁自校准 selftest-gates（42 例负向对照，必须全部按预期）" \
    env SELFTEST_CONCURRENCY="${SELFTEST_CONCURRENCY:-8}" node scripts/selftest-gates.mjs
run "③ digest 是否需要重钉（dry-run）" \
    node scripts/repin-digests.mjs --dry-run
run "④ i1 解析层自检" \
    python3 skills/macro-capital-framework/references/scripts/i1_collision_check.py --selftest
run "⑤ 冒烟测试（照 transport 的 smokeArgs 真跑一次：声明即可执行）" \
    node scripts/smoke-test.mjs
echo "── ⑥ 覆盖率（盲区可见；含判据强度分级）"
node scripts/check-pack.mjs --coverage 2>/dev/null | sed -n '/覆盖率/,$p'
echo "── ⑦ 判据登记表（查了什么／没查什么）"
node scripts/check-pack.mjs 2>/dev/null >/dev/null; node -e "const t=require('fs').readFileSync('CRITERIA.md','utf8');const n=(t.match(/^\\| \`/gm)||[]).length;console.log('  CRITERIA.md 在位，登记判据 '+n+' 条（与代码逐字一致由 criteria-doc 判据把关）')"

if [ "$rc" -eq 0 ]; then echo; echo "✓ 发布前五件套全通过（附覆盖率报表）"; else echo; echo "✗ 有检查未通过 —— 不要发布"; fi
exit "$rc"
