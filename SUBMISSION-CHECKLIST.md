# 提交物验收清单（观澜领域包）

> 平台评审按此逐项打勾；先自检再提交。

- [x] `pack.json`（id=macro-capital-analyst / version=2.2.0 / schemaVersion=2 / caliberDeclarations 四类口径）
- [x] `experts/macro-capital-analyst.json`（schemaVersion 2 全字段；`source/SOURCE-MANIFEST.json` 溯源齐备，33 份材料）
- [x] `scenarios/*.json`（DAG 依赖无环、专家 id 全部可解析、deliverable 明确；共 2 个）
- [x] `output-templates/` + `quality-policies/`（五道起步门禁覆盖数字一致与禁例 token；含 `net-active-return-required` / `active-risk-budget` 硬门）
- [x] `method-packs/`（六步内化 / 九层能力 / 两道闸门）+ `team-templates/`（2 个组队模板）
- [x] `skills/macro-capital-framework/SKILL.md`（触发词齐全，references/checklist-template.md + scripts/i1_collision_check.py 完整）
- [x] 数据契约表（`data-contracts/capability-contract.csv`，自建数据引擎契约）
- [ ] 试运行记录：一单端到端交付 + GATE 文件 + 匿名化对外样本（待首单运行后回填）
- [x] 全部 JSON 可解析（`python3 -m json.tool`）
- [x] 全部【替换：…】占位符已清除
- [x] 无凭据 / 密钥 / 内网地址 / 真实个人信息（publicLabel 仅「领域·首字母」）
