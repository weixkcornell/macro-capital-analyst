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
run "② 门禁自校准 selftest-gates（负向对照，必须全部按预期）" \
    node scripts/selftest-gates.mjs
run "③ digest 是否需要重钉（dry-run）" \
    node scripts/repin-digests.mjs --dry-run
run "④ i1 解析层自检" \
    python3 skills/macro-capital-framework/references/scripts/i1_collision_check.py --selftest

if [ "$rc" -eq 0 ]; then echo; echo "✓ 发布前四件套全通过"; else echo; echo "✗ 有检查未通过 —— 不要发布"; fi
exit "$rc"
