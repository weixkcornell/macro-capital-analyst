#!/usr/bin/env bash
# 把本仓同步到"平台实际读取的安装副本"。
#
# 为什么要有这个文件：平台读的不是 git 仓，而是 domain-packs/ 下的安装副本；
# 手工 rsync 两次的经验是——① 必须备份（否则不可回滚）② 必须保留安装侧独有的 routing/
# ③ 必须核对版本与自检，否则"同步了"只是自我感觉。
#
# 用法：scripts/install-to-profile.sh [目标目录]
#   目标目录默认 ../main/bank/domain-packs/macro-capital-analyst（相对本仓）
# 环境：BACKUP_DIR（默认 <本仓>/../.install-bak）
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$(cd "$REPO/.." && pwd)/main/bank/domain-packs/macro-capital-analyst}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$REPO/.." && pwd)/.install-bak}"

[ -f "$TARGET/pack.json" ] || { echo "✗ 目标不是领域包目录：$TARGET"; exit 2; }
command -v rsync >/dev/null || { echo "✗ 需要 rsync"; exit 2; }

SRC_VER="$(node -e "process.stdout.write(require('$REPO/pack.json').version)")"
DST_VER="$(node -e "process.stdout.write(require('$TARGET/pack.json').version)")"

if [ "$SRC_VER" = "$DST_VER" ]; then
  echo "⇒ 副本已是 $SRC_VER，无需同步（如需强制覆盖，先改版本号或手工 rsync）"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_DIR/$(basename "$TARGET")-$DST_VER-$STAMP"
mkdir -p "$BACKUP"
cp -a "$TARGET/." "$BACKUP/"
echo "① 已备份：$BACKUP（安装侧版本 $DST_VER，可整体回滚）"

# 增量同步；豁免安装侧独有项（routing/ 是 v2.0 遗留，仓内已移除，删它属"回溯删除"，不在本脚本权限内）
rsync -a --delete \
  --exclude='.git' --exclude='.github' --exclude='engine' \
  --exclude='__pycache__' --exclude='*.pyc' --exclude='routing' \
  "$REPO/" "$TARGET/"
echo "② 已同步：$SRC_VER → $TARGET"

# 核对：版本 + 三件自检（都在副本内跑，验的是副本本身）
NEW_VER="$(node -e "process.stdout.write(require('$TARGET/pack.json').version)")"
[ "$NEW_VER" = "$SRC_VER" ] || { echo "✗ 版本未对齐：$NEW_VER != $SRC_VER"; exit 1; }
echo "③ 版本核对通过：$NEW_VER"
( cd "$TARGET" && node scripts/check-pack.mjs >/dev/null && echo "   · check-pack ✓" \
  && SELFTEST_CONCURRENCY=8 node scripts/selftest-gates.mjs >/dev/null && echo "   · selftest-gates ✓" \
  && node scripts/smoke-test.mjs >/dev/null && echo "   · smoke-test ✓" \
  && python3 skills/macro-capital-framework/references/scripts/i1_collision_check.py --selftest >/dev/null && echo "   · i1 --selftest ✓" )
rm -rf "$TARGET/skills/macro-capital-framework/references/scripts/__pycache__"
echo "④ 安装副本自检全通过"
