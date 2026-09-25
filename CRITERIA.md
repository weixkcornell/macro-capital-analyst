# 判据登记表（CRITERIA）

> **本文件由代码生成，不要手改**：`node scripts/check-pack.mjs --criteria-md CRITERIA.md`。
> `check-pack` 的 `criteria-doc` 判据会**逐字比对**下面的 JSON 块与代码里的登记表，不一致即 FAIL。
> 上面这张表是可读视图；**判定以 JSON 块为准**（表格不参与比对）。

| id | 强度 | 对象 | 量程（查什么） | 不查什么 | 可报出的 code |
|---|---|---|---|---|---|
| `validator` | hard | 平台校验器（loadPackFromDirSync）的 error 诊断 | schema 合法性、DAG 无环、门禁绑定、场景↔组队模板一致、策略解析 | 平台未声明的语义（如"结论是否正确"）；无私有库时整条不运行（见 skip note） | `（平台校验器自身的 code）` |
| `version-lockstep` | hard | pack.json 与 10 个维度的 version 字段 | 全部实体/配置文件的 version 必须与 pack.json 一致 | README/清单里的版本（那是 doc-version 的活）；脚本自身的"版本" | `version-drift`, `missing-version` |
| `doc-version` | hard | README 徽章 / README 版本历史首条 / SUBMISSION-CHECKLIST 的 version= | 三处必须等于 pack.json 的 version；版本历史首条不得是占位（bump-version 生成） | README 正文里出现的其他版本字样（历史条目本就该保留旧版本号） | `doc-version-drift`, `missing-version-badge`, `missing-version-history`, `missing-readme`, `missing-checklist`, `missing-checklist-version`, `release-note-placeholder` |
| `digest` | hard | skill-packages.source.digest 与 domain-knowledge.snapshot.digest | 必须有 digestTarget ＋ digestAlgorithm；当场按目标文件重算并比对 | digest 的语义（digest 等于"内容指纹"，不等于"内容正确"） | `digest-without-target`, `digest-target-missing`, `digest-mismatch`, `digest-algorithm-invalid` |
| `banned-tokens` | hard | SOURCE-MANIFEST 的题名/作者词干 与 quality-policies 的 bannedTokens | strict 缺口阈值 0；review 未决项上限 0；allowlist 为"明确不得入禁例"的通用术语 | 产物内是否真的出现这些词（那是 quality-policy 的 banned-tokens 门在交付物上跑的）；禁例的语义恰当性（人工判定） | `banned-tokens-gap`, `banned-tokens-review-backlog` |
| `placeholder-residue` | hard | 包内全部文本文件（json/md/mjs/py/csv/yml/sh/txt） | 【替换：<具体内容>】即残留；空体/省略号/正则写法/尖括号体/引述域＝记法不计 | 产物里的占位符（由 quality-policy placeholder-clean 管）；语义层"该填而没填" | `placeholder-residue` |
| `file-ref` | hard | SOURCE-MANIFEST 的 fileRefRoot 与 materials[].fileRef | root 必须声明；fileRef 不得含绝对路径/URL/内网地址 | fileRef 的存在性（38/38 材料按版权设计不分发，查存在性会全红） | `fileRef-root-undeclared`, `fileRef-unsafe` |
| `ref-integrity` | hard | skillPackages.contributions / scenarios 引用 / SKILL.md 点名文件 / transport 路径参数 | 每个 id 与路径都必须解析到实际存在的对象或文件 | 被引用对象的"内容合适性"（只判可解析）；平台层解析的能力（如 wind/zyt/beike） | `skill-contribution-target-missing`, `scenario-reference-missing`, `skill-reference-missing`, `transport-target-missing` |
| `scripts-syntax` | hard | scripts/ 与 skills/ 下的 .mjs/.js/.sh/.py | 语法可编译（node --check / bash -n / compile()） | 运行时行为（那由 selftest-gates 与 smoke-test 覆盖）；依赖是否装好 | `script-syntax-error` |
| `structure` | structural | 10 个维度的字段形状 ＋ 门禁四要素 ＋ documentStructure ＋ kb collection root ＋ .gitattributes | 必需字段/非空列表；门禁 id·kind·severity·appliesTo；章节 name/required；步骤编号不重复；collection root 不存在须显式声明；eol=lf | 字段取值的语义正确性（如某条方法的措辞对不对）；枚举值的白名单（只判存在与非空） | `structure-missing-field`, `structure-empty-list`, `structure-gate-missing-field`, `structure-document-structure`, `structure-duplicate-step`, `structure-collection-root`, `structure-gitattributes` |
| `doc-script-ref` | structural | *.md 与 .github/workflows/*.yml 中点名的 scripts/ 路径 | 点名即必须存在 | 文档里点名的非 scripts/ 路径；文档叙述是否仍准确 | `doc-script-ref-missing` |
| `workflow-basic` | structural | .github/workflows/*.yml | 存在 on: 与 jobs: 两块 | YAML 语法是否合法、job 能否真跑（CI 由平台执行） | `workflow-basic` |
| `gitignore-rule` | structural | .gitignore | 必须忽略 engine/ 与 __pycache__ | 是否还有其他该忽略而未忽略的路径（人工判断） | `gitignore-rule` |
| `license-consistency` | structural | LICENSE 与包内声明的 license | LICENSE 文本须包含包内声明的每一项 license 名 | 许可证法务层面的适用性（文本存在 ≠ 授权链完整） | `license-consistency` |
| `csv-structure` | structural | data-contracts/*.csv | 表头须含 capability/method/caliber/unit；每行列数一致；capability 值唯一；无 UTF-8 BOM | 各列取值的语义正确性（如单元是否正确）；与产物的实际使用是否一致 | `csv-structure` |
| `contract-vs-tools` | advisory | data-contracts/capability-contract.csv ↔ toolProviders.capabilities | 两者 capability 名不完全对应时给 note（不同口径，非缺陷） | 不做判定：二者分别描述"数据引擎契约"与"包内可调度能力" | — |
| `platform-resolution` | advisory | scenarios[].toolPolicy.allowed 中未由本包声明的能力 | 按能力聚合为一条 note（列出出现场景） | 平台是否真的提供这些能力、凭据是否可用 | — |
| `coverage` | advisory | 包内全部文件 | 登记"哪个判据读过哪个文件"，输出 有针对性判据／仅通用扫描／没人读 与强度分布 | 判据本身的强度（"被 hard 判据读过"≠"该文件被充分验证"） | — |
| `criteria-doc` | hard | CRITERIA.md 与上面的 CRITERIA 登记表 | CRITERIA.md 必须存在，且其 ```json 代码块与登记表逐字一致 | 文档措辞的可读性；登记表"是否覆盖了所有该有的判据"（需要人工审阅） | `criteria-doc-missing`, `criteria-doc-drift` |

**强度含义**：`hard`＝错即坏（对象会因此不可用或自相矛盾）；`structural`＝缺即不完整（形状/声明层）；`advisory`＝只出 note，不做判定。

**这张表要回答的问题**：`check-pack` 到底查了什么、**没查什么**。把"没查什么"写出来，是为了让"0 problems"这句话有明确的适用范围 —— **范围之外不是"已验证"，是"没人看"**（覆盖率报表会点名那类文件）。

```json
[
 {
  "id": "validator",
  "level": "hard",
  "subject": "平台校验器（loadPackFromDirSync）的 error 诊断",
  "scope": "schema 合法性、DAG 无环、门禁绑定、场景↔组队模板一致、策略解析",
  "notChecked": "平台未声明的语义（如\"结论是否正确\"）；无私有库时整条不运行（见 skip note）",
  "codes": [
   "（平台校验器自身的 code）"
  ]
 },
 {
  "id": "version-lockstep",
  "level": "hard",
  "subject": "pack.json 与 10 个维度的 version 字段",
  "scope": "全部实体/配置文件的 version 必须与 pack.json 一致",
  "notChecked": "README/清单里的版本（那是 doc-version 的活）；脚本自身的\"版本\"",
  "codes": [
   "version-drift",
   "missing-version"
  ]
 },
 {
  "id": "doc-version",
  "level": "hard",
  "subject": "README 徽章 / README 版本历史首条 / SUBMISSION-CHECKLIST 的 version=",
  "scope": "三处必须等于 pack.json 的 version；版本历史首条不得是占位（bump-version 生成）",
  "notChecked": "README 正文里出现的其他版本字样（历史条目本就该保留旧版本号）",
  "codes": [
   "doc-version-drift",
   "missing-version-badge",
   "missing-version-history",
   "missing-readme",
   "missing-checklist",
   "missing-checklist-version",
   "release-note-placeholder"
  ]
 },
 {
  "id": "digest",
  "level": "hard",
  "subject": "skill-packages.source.digest 与 domain-knowledge.snapshot.digest",
  "scope": "必须有 digestTarget ＋ digestAlgorithm；当场按目标文件重算并比对",
  "notChecked": "digest 的语义（digest 等于\"内容指纹\"，不等于\"内容正确\"）",
  "codes": [
   "digest-without-target",
   "digest-target-missing",
   "digest-mismatch",
   "digest-algorithm-invalid"
  ]
 },
 {
  "id": "banned-tokens",
  "level": "hard",
  "subject": "SOURCE-MANIFEST 的题名/作者词干 与 quality-policies 的 bannedTokens",
  "scope": "strict 缺口阈值 0；review 未决项上限 0；allowlist 为\"明确不得入禁例\"的通用术语",
  "notChecked": "产物内是否真的出现这些词（那是 quality-policy 的 banned-tokens 门在交付物上跑的）；禁例的语义恰当性（人工判定）",
  "codes": [
   "banned-tokens-gap",
   "banned-tokens-review-backlog"
  ]
 },
 {
  "id": "placeholder-residue",
  "level": "hard",
  "subject": "包内全部文本文件（json/md/mjs/py/csv/yml/sh/txt）",
  "scope": "【替换：<具体内容>】即残留；空体/省略号/正则写法/尖括号体/引述域＝记法不计",
  "notChecked": "产物里的占位符（由 quality-policy placeholder-clean 管）；语义层\"该填而没填\"",
  "codes": [
   "placeholder-residue"
  ]
 },
 {
  "id": "file-ref",
  "level": "hard",
  "subject": "SOURCE-MANIFEST 的 fileRefRoot 与 materials[].fileRef",
  "scope": "root 必须声明；fileRef 不得含绝对路径/URL/内网地址",
  "notChecked": "fileRef 的存在性（38/38 材料按版权设计不分发，查存在性会全红）",
  "codes": [
   "fileRef-root-undeclared",
   "fileRef-unsafe"
  ]
 },
 {
  "id": "ref-integrity",
  "level": "hard",
  "subject": "skillPackages.contributions / scenarios 引用 / SKILL.md 点名文件 / transport 路径参数",
  "scope": "每个 id 与路径都必须解析到实际存在的对象或文件",
  "notChecked": "被引用对象的\"内容合适性\"（只判可解析）；平台层解析的能力（如 wind/zyt/beike）",
  "codes": [
   "skill-contribution-target-missing",
   "scenario-reference-missing",
   "skill-reference-missing",
   "transport-target-missing"
  ]
 },
 {
  "id": "scripts-syntax",
  "level": "hard",
  "subject": "scripts/ 与 skills/ 下的 .mjs/.js/.sh/.py",
  "scope": "语法可编译（node --check / bash -n / compile()）",
  "notChecked": "运行时行为（那由 selftest-gates 与 smoke-test 覆盖）；依赖是否装好",
  "codes": [
   "script-syntax-error"
  ]
 },
 {
  "id": "structure",
  "level": "structural",
  "subject": "10 个维度的字段形状 ＋ 门禁四要素 ＋ documentStructure ＋ kb collection root ＋ .gitattributes",
  "scope": "必需字段/非空列表；门禁 id·kind·severity·appliesTo；章节 name/required；步骤编号不重复；collection root 不存在须显式声明；eol=lf",
  "notChecked": "字段取值的语义正确性（如某条方法的措辞对不对）；枚举值的白名单（只判存在与非空）",
  "codes": [
   "structure-missing-field",
   "structure-empty-list",
   "structure-gate-missing-field",
   "structure-document-structure",
   "structure-duplicate-step",
   "structure-collection-root",
   "structure-gitattributes"
  ]
 },
 {
  "id": "doc-script-ref",
  "level": "structural",
  "subject": "*.md 与 .github/workflows/*.yml 中点名的 scripts/ 路径",
  "scope": "点名即必须存在",
  "notChecked": "文档里点名的非 scripts/ 路径；文档叙述是否仍准确",
  "codes": [
   "doc-script-ref-missing"
  ]
 },
 {
  "id": "workflow-basic",
  "level": "structural",
  "subject": ".github/workflows/*.yml",
  "scope": "存在 on: 与 jobs: 两块",
  "notChecked": "YAML 语法是否合法、job 能否真跑（CI 由平台执行）",
  "codes": [
   "workflow-basic"
  ]
 },
 {
  "id": "gitignore-rule",
  "level": "structural",
  "subject": ".gitignore",
  "scope": "必须忽略 engine/ 与 __pycache__",
  "notChecked": "是否还有其他该忽略而未忽略的路径（人工判断）",
  "codes": [
   "gitignore-rule"
  ]
 },
 {
  "id": "license-consistency",
  "level": "structural",
  "subject": "LICENSE 与包内声明的 license",
  "scope": "LICENSE 文本须包含包内声明的每一项 license 名",
  "notChecked": "许可证法务层面的适用性（文本存在 ≠ 授权链完整）",
  "codes": [
   "license-consistency"
  ]
 },
 {
  "id": "csv-structure",
  "level": "structural",
  "subject": "data-contracts/*.csv",
  "scope": "表头须含 capability/method/caliber/unit；每行列数一致；capability 值唯一；无 UTF-8 BOM",
  "notChecked": "各列取值的语义正确性（如单元是否正确）；与产物的实际使用是否一致",
  "codes": [
   "csv-structure"
  ]
 },
 {
  "id": "contract-vs-tools",
  "level": "advisory",
  "subject": "data-contracts/capability-contract.csv ↔ toolProviders.capabilities",
  "scope": "两者 capability 名不完全对应时给 note（不同口径，非缺陷）",
  "notChecked": "不做判定：二者分别描述\"数据引擎契约\"与\"包内可调度能力\"",
  "codes": []
 },
 {
  "id": "platform-resolution",
  "level": "advisory",
  "subject": "scenarios[].toolPolicy.allowed 中未由本包声明的能力",
  "scope": "按能力聚合为一条 note（列出出现场景）",
  "notChecked": "平台是否真的提供这些能力、凭据是否可用",
  "codes": []
 },
 {
  "id": "coverage",
  "level": "advisory",
  "subject": "包内全部文件",
  "scope": "登记\"哪个判据读过哪个文件\"，输出 有针对性判据／仅通用扫描／没人读 与强度分布",
  "notChecked": "判据本身的强度（\"被 hard 判据读过\"≠\"该文件被充分验证\"）",
  "codes": []
 },
 {
  "id": "criteria-doc",
  "level": "hard",
  "subject": "CRITERIA.md 与上面的 CRITERIA 登记表",
  "scope": "CRITERIA.md 必须存在，且其 ```json 代码块与登记表逐字一致",
  "notChecked": "文档措辞的可读性；登记表\"是否覆盖了所有该有的判据\"（需要人工审阅）",
  "codes": [
   "criteria-doc-missing",
   "criteria-doc-drift"
  ]
 }
]
```
