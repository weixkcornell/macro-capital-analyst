#!/usr/bin/env bash
# 发布前四件套：一条命令跑完，任一失败即非零退出。
# 用法：scripts/release-check.sh
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
rc=0
run() { echo "── $1"; shift; "$@" || { echo "   ✗ 失败"; rc=1; }; }

run "① 包自检 check-pack（版本 lockstep／doc lockstep／digest 可复现／占位符／fileRef 安全／bannedTokens 阈值）" \
    node scripts/check-pack.mjs --max-notes 10
run "② 门禁自校准 selftest-gates（42 例负向对照，必须全部按预期）" \
    env SELFTEST_CONCURRENCY="${SELFTEST_CONCURRENCY:-8}" node scripts/selftest-gates.mjs
run "③ digest 是否需要重钉（dry-run）" \
    node scripts/repin-digests.mjs --dry-run
run "④ i1 解析层自检" \
    python3 skills/macro-capital-framework/references/scripts/i1_collision_check.py --selftest
run "⑤ 冒烟测试（照 transport 的 smokeArgs 真跑一次：声明即可执行）" \
    node scripts/smoke-test.mjs
run "⑥ 文档-契约一致性（文档与契约里写的字段必须存在于真实 inputSchema；离线）" \
    node scripts/check-doc-commands.mjs --dir .
run "⑦ 输出模板一致性门自校准（2 正向 + 7 负向对照，必须全部按预期）" \
    node scripts/check-template-conformance.mjs --selftest
run "⑧ 门禁判据来源自校准（声明的判据必须真的生效：移动端 7 项 + Wind 6 项）" \
    bash -c 'python3 scripts/audit-mobile.py --selftest && python3 scripts/check-wind-provenance.py --selftest'
run "⑨ 门禁接线检查（哪个门由哪个执行器消费哪些判据键：13 门 + 5 对照）" \
    bash -c 'node scripts/check-gate-wiring.mjs && node scripts/check-gate-wiring.mjs --selftest'
echo "── ⑦ 覆盖率（盲区可见；含判据强度分级）"
node scripts/check-pack.mjs --coverage 2>/dev/null | sed -n '/覆盖率/,$p'
echo "── ⑧ 判据登记表（查了什么／没查什么）"
node scripts/check-pack.mjs 2>/dev/null >/dev/null; node -e "const t=require('fs').readFileSync('CRITERIA.md','utf8');const n=(t.match(/^\\| \`/gm)||[]).length;console.log('  CRITERIA.md 在位，登记判据 '+n+' 条（与代码逐字一致由 criteria-doc 判据把关）')"

if [ "$rc" -eq 0 ]; then echo; echo "✓ 发布前九件套全通过（附覆盖率报表）"; else echo; echo "✗ 有检查未通过 —— 不要发布"; fi
exit "$rc"
