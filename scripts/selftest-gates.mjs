#!/usr/bin/env node
/**
 * 门禁自校准（双向对照）：`check-pack.mjs` 的负向样本套件。
 *
 * 为什么要有这个文件：改好一处缺陷之后，「这道门禁下次还能不能抓住它」必须**可复跑**。
 * v2.4.1 的两道新门禁是在临时目录里手工注入缺陷验的 —— 手工验证不可复跑、也不随代码留存，
 * 属于「当时为真、事后不可复核」。本脚本把它固化成一次命令。
 *
 * 做法：把整个包复制到临时目录 → 逐个注入一个已知缺陷 → 运行 `check-pack.mjs` →
 * 断言它报出**预期 code** 且退出码非零；基线（不注入）必须 0 problem。
 *
 * 用法：  node scripts/selftest-gates.mjs [packDir]
 * 退出码：0 = 全部按预期；1 = 有门禁未抓住 / 行为不符预期；2 = 环境不可用
 */
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACK = resolve(process.argv[2] ?? resolve(HERE, '..'))
const CHECK = resolve(HERE, 'check-pack.mjs')

if (!existsSync(resolve(PACK, 'pack.json'))) {
  console.error(`✗ 不是领域包目录：${PACK}`)
  process.exit(2)
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8')
const write = (root, rel, s) => writeFileSync(join(root, rel), s)
const rm = (root, rel) => rmSync(join(root, rel), { force: true })

/** 替换必须命中且只命中一次 —— 否则"注入失败"会被误读成"门禁没抓住"。 */
function replaceOnce(root, rel, re, to) {
  const s = read(root, rel)
  const m = s.match(re)
  if (!m) throw new Error(`注入失败：${rel} 中找不到 ${re}`)
  if (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')).length !== 1) {
    throw new Error(`注入目标不唯一：${rel} 中 ${re} 命中多处`)
  }
  write(root, rel, s.replace(re, to))
}

const firstJson = (root, dirName, pred) => {
  const d = join(root, dirName)
  for (const f of readdirSync(d).filter(n => n.endsWith('.json'))) {
    const o = JSON.parse(read(root, `${dirName}/${f}`))
    if (pred(o)) return `${dirName}/${f}`
  }
  throw new Error(`未找到目标实体于 ${dirName}`)
}

// 每个样本：注入一处已知缺陷，期望 check-pack 报出该 code。
const CASES = [
  { name: '基线（不注入）', expectCode: null, mutate: () => {} },
  {
    name: 'README 徽章与 pack.json 不同版本',
    expectCode: 'doc-version-drift',
    mutate: r => replaceOnce(r, 'README.md', /badge\/Version-[^-\s]+-/, 'badge/Version-9.9.9-'),
  },
  {
    name: 'README 版本历史首条落后',
    expectCode: 'doc-version-drift',
    mutate: r => {
      const s = read(r, 'README.md')
      const i = s.search(/^##\s*版本历史\s*$/m)
      const head = s.slice(i).match(/^- \*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/m)
      if (!head) throw new Error('注入失败：README 版本历史里找不到 "- **X.Y.Z**" 首条')
      write(r, 'README.md', s.slice(0, i) + s.slice(i).replace(head[0], '- **9.9.9**'))
    },
  },
  {
    name: 'SUBMISSION-CHECKLIST 版本落后',
    expectCode: 'doc-version-drift',
    mutate: r => replaceOnce(r, 'SUBMISSION-CHECKLIST.md', /version=[0-9]+\.[0-9]+\.[0-9]+/, 'version=9.9.9'),
  },
  {
    name: '实体 version 与 pack.json 不一致',
    expectCode: 'version-drift',
    mutate: r => {
      const f = firstJson(r, 'method-packs', () => true)
      replaceOnce(r, f, /"version": "[0-9]+\.[0-9]+\.[0-9]+"/, '"version": "9.9.9"')
    },
  },
  {
    name: 'digest 与 digestTarget 内容不符',
    expectCode: 'digest-mismatch',
    mutate: r => {
      const f = firstJson(r, 'domain-knowledge', o => o?.snapshot?.digest)
      replaceOnce(r, f, /"digest": "[0-9a-f]{64}"/, '"digest": "deadbeef' + '0'.repeat(56) + '"')
    },
  },
  {
    name: '声明了 digest 但没有 digestTarget',
    expectCode: 'digest-without-target',
    mutate: r => {
      const f = firstJson(r, 'skill-packages', o => o?.source?.digest)
      replaceOnce(r, f, /,\s*"digestTarget": "[^"]*"/, '')
    },
  },
  {
    name: '包内出现未替换的占位符残留',
    expectCode: 'placeholder-residue',
    // check-pack-allow: placeholder-residue —— 本文件按设计必须写出"残留长什么样"，
    // 否则这条门禁无从被校准。豁免是显式声明并可 grep 的（check-pack 会为此打印一条 note）。
    mutate: r => write(r, 'data-contracts/_selftest_ph.json', '{"x":"【替换：在此填来源】"}\n'),
  },
  {
    name: 'fileRef 写了绝对路径',
    expectCode: 'fileRef-unsafe',
    mutate: r => {
      const f = 'source/SOURCE-MANIFEST.json'
      const o = JSON.parse(read(r, f))
      o.materials[0].fileRef = '/etc/passwd'
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '版本历史首条仍是"待补发布说明"',
    expectCode: 'release-note-placeholder',
    mutate: r => {
      const s = read(r, 'README.md')
      const i = s.search(/^##\s*版本历史\s*$/m)
      const m = s.slice(i).match(/^- \*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*（[^）]*）：.*$/m)
      if (!m) throw new Error('注入失败：找不到版本历史首条')
      write(r, 'README.md', s.replace(m[0], `- **${m[1]}**（2026-01-01）：（待补发布说明）`))
    },
  },
  {
    name: '禁例覆盖出现缺口（删掉通用术语豁免表 ⇒ 那些词干变严格缺口）',
    expectCode: 'banned-tokens-gap',
    mutate: r => {
      const f = firstJson(r, 'quality-policies', o => o?.gates?.some(g => g.config?.bannedTokensAllowlist))
      const o = JSON.parse(read(r, f))
      delete o.gates.find(x => x.config?.bannedTokensAllowlist).config.bannedTokensAllowlist
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'contributions 指向不存在的 methodPack',
    expectCode: 'skill-contribution-target-missing',
    mutate: r => {
      const f = firstJson(r, 'skill-packages', o => o?.contributions)
      const o = JSON.parse(read(r, f))
      o.contributions.methodPacks = [...(o.contributions.methodPacks ?? []), 'NOPE-method-pack']
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'scenario 引用不存在的 outputTemplate',
    expectCode: 'scenario-reference-missing',
    mutate: r => {
      const f = firstJson(r, 'scenarios', o => o?.outputTemplate)
      const o = JSON.parse(read(r, f))
      o.outputTemplate = 'NOPE-template'
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'SKILL.md 点名了不存在的文件',
    expectCode: 'skill-reference-missing',
    mutate: r => {
      const f = firstJson(r, 'skill-packages', o => o?.source?.digestTarget)
      const o = JSON.parse(read(r, f))
      const md = o.source.digestTarget
      write(r, md, read(r, md) + '\n另见 `references/NOPE.md`。\n')
    },
  },
  {
    name: '质量门禁缺字段（severity）',
    expectCode: 'structure-gate-missing-field',
    mutate: r => {
      const f = firstJson(r, 'quality-policies', o => o?.gates?.length)
      const o = JSON.parse(read(r, f))
      delete o.gates[0].severity
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '脚本语法错误（scripts/ 下不可编译）',
    expectCode: 'script-syntax-error',
    mutate: r => write(r, 'scripts/_selftest_broken.mjs', 'const x = (\n'),
  },
  {
    name: '文档点名了不存在的脚本',
    expectCode: 'doc-script-ref-missing',
    mutate: r => write(r, 'README.md', read(r, 'README.md') + '\n见 `scripts/NOPE.mjs`。\n'),
  },
  {
    name: '.gitignore 不再忽略运行目录 engine/',
    expectCode: 'gitignore-rule',
    mutate: r => write(r, '.gitignore', read(r, '.gitignore').replace('engine/', '')),
  },
  {
    name: '实体没有 version 字段',
    expectCode: 'missing-version',
    mutate: r => {
      const f = firstJson(r, 'method-packs', () => true)
      const o = JSON.parse(read(r, f))
      delete o.version
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'README 没有版本徽章',
    expectCode: 'missing-version-badge',
    mutate: r => replaceOnce(r, 'README.md', /^.*badge\/Version-.*$/m, '<!-- 徽章被移除 -->'),
  },
  {
    name: 'README 没有版本历史章节',
    expectCode: 'missing-version-history',
    mutate: r => replaceOnce(r, 'README.md', /^##\s*版本历史\s*$/m, '## 变更'),
  },
  {
    name: 'README 缺失',
    expectCode: 'missing-readme',
    mutate: r => rm(r, 'README.md'),
  },
  {
    name: 'SUBMISSION-CHECKLIST 缺失',
    expectCode: 'missing-checklist',
    mutate: r => rm(r, 'SUBMISSION-CHECKLIST.md'),
  },
  {
    name: '清单里没有 version= 标记',
    expectCode: 'missing-checklist-version',
    mutate: r => replaceOnce(r, 'SUBMISSION-CHECKLIST.md', /version=\d+\.\d+\.\d+/, 'ver=X'),
  },
  {
    name: 'digestTarget 指向不存在的文件',
    expectCode: 'digest-target-missing',
    mutate: r => {
      const f = firstJson(r, 'skill-packages', o => o?.source?.digest)
      const o = JSON.parse(read(r, f))
      o.source.digestTarget = 'NOPE.md'
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'digestAlgorithm 不可用',
    expectCode: 'digest-algorithm-invalid',
    mutate: r => {
      const f = firstJson(r, 'skill-packages', o => o?.source?.digest)
      const o = JSON.parse(read(r, f))
      o.source.digestAlgorithm = 'md5x'
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '出现未决的 review 项（上限为 0）',
    expectCode: 'banned-tokens-review-backlog',
    mutate: r => {
      // review 只统计"落在 review 域内、且未被禁例覆盖"的清单词干 ⇒ 必须把某个已覆盖词干
      // 从 bannedTokens 挪到 review，才构造得出未决项（第一版随手 push 一个词干是不生效的）
      const STEM = 'Empirical Asset Pricing'
      const f = firstJson(r, 'quality-policies', o => o?.gates?.some(g => g.config?.bannedTokensReview))
      const o = JSON.parse(read(r, f))
      const cfg = o.gates.find(x => x.config?.bannedTokensReview).config
      if (!cfg.bannedTokens.includes(STEM)) throw new Error(`注入前提不成立：bannedTokens 里没有「${STEM}」`)
      cfg.bannedTokens = cfg.bannedTokens.filter(x => x !== STEM)
      cfg.bannedTokensReview.push(STEM)
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'fileRefRoot 未声明',
    expectCode: 'fileRef-root-undeclared',
    mutate: r => {
      const f = 'source/SOURCE-MANIFEST.json'
      const o = JSON.parse(read(r, f))
      delete o.fileRefRoot
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '实体缺必需字段（persona）',
    expectCode: 'structure-missing-field',
    mutate: r => {
      const f = firstJson(r, 'experts', () => true)
      const o = JSON.parse(read(r, f))
      delete o.persona
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '必需列表为空（methods=[]）',
    expectCode: 'structure-empty-list',
    mutate: r => {
      const f = firstJson(r, 'experts', () => true)
      const o = JSON.parse(read(r, f))
      o.methods = []
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'documentStructure 没有 sections',
    expectCode: 'structure-document-structure',
    mutate: r => {
      const f = firstJson(r, 'output-templates', () => true)
      const o = JSON.parse(read(r, f))
      o.documentStructure = { pattern: o.documentStructure?.pattern ?? '总-分-总' }
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '方法包步骤编号重复',
    expectCode: 'structure-duplicate-step',
    mutate: r => {
      const f = firstJson(r, 'method-packs', o => Array.isArray(o?.steps) && o.steps.length > 1)
      const o = JSON.parse(read(r, f))
      o.steps[1].step = o.steps[0].step
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'kb collection root 不存在且无说明',
    expectCode: 'structure-collection-root',
    mutate: r => {
      const f = firstJson(r, 'domain-knowledge', o => o?.collections?.length)
      const o = JSON.parse(read(r, f))
      o.collections[0].root = 'NOPE-DIR'
      delete o.collections[0].note
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '.gitattributes 未钉 eol=lf',
    expectCode: 'structure-gitattributes',
    mutate: r => write(r, '.gitattributes', '* text=auto\n'),
  },
  {
    name: 'workflow 缺 jobs:',
    expectCode: 'workflow-basic',
    mutate: r => write(r, '.github/workflows/check.yml', 'name: x\non:\n  push:\n'),
  },
  {
    name: 'LICENSE 与包内 license 声明不一致',
    expectCode: 'license-consistency',
    mutate: r => {
      const f = firstJson(r, 'skill-packages', o => o?.source?.license)
      const o = JSON.parse(read(r, f))
      o.source.license = 'Apache-2.0'
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: 'CRITERIA.md 缺失',
    expectCode: 'criteria-doc-missing',
    mutate: r => rm(r, 'CRITERIA.md'),
  },
  {
    name: '质量门禁没有 config（纸上硬门）',
    expectCode: 'structure-gate-no-config',
    mutate: r => {
      const f = firstJson(r, 'quality-policies', o => o?.gates?.length)
      const o = JSON.parse(read(r, f))
      delete o.gates[0].config
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
  {
    name: '判据自身缺少负向对照（矩阵自指）',
    expectCode: 'negative-control-gap',
    mutate: r => {
      // 拆开字面量：否则本用例自身就成了第二个匹配点（第一版就是这样"注入目标不唯一"）
      const pat = new RegExp("expectCode: '" + "version-drift" + "'")
      replaceOnce(r, 'scripts/selftest-gates.mjs', pat, "expectCode: '" + "version-drift-XXX" + "'")
    },
  },
  {
    name: 'CRITERIA.md 与代码登记表不一致',
    expectCode: 'criteria-doc-drift',
    mutate: r => replaceOnce(r, 'CRITERIA.md', /  "id": "validator",\n  "level": "hard",/, '  "id": "validator",\n  "level": "soft",'),
  },
  {
    name: 'CSV 表头缺必需列（capability）',
    expectCode: 'csv-structure',
    mutate: r => replaceOnce(r, 'data-contracts/capability-contract.csv', /^capability,/, 'capabilityX,'),
  },
  {
    name: 'transport 的路径参数不存在',
    expectCode: 'transport-target-missing',
    mutate: r => {
      const f = firstJson(r, 'tool-providers', o => o?.transports?.length)
      const o = JSON.parse(read(r, f))
      o.transports[0].args = ['skills/NOPE.py']
      write(r, f, JSON.stringify(o, null, 2) + '\n')
    },
  },
]

// 并发跑：每个样本要起一个 check-pack 子进程（现在 40+ 例），串行会跑成分钟级。
// 并发度用 SELFTEST_CONCURRENCY 调（默认 4）；输出仍按样本顺序打印，便于对照。
const CONCURRENCY = Math.max(1, Number(process.env.SELFTEST_CONCURRENCY ?? 4))

function runCase(c) {
  const tmp = mkdtempSync(join(tmpdir(), 'pack-selftest-'))
  let out = '', code = 0
  try {
    cpSync(PACK, tmp, { recursive: true, filter: s => !/[/\\](\\.git|engine|__pycache__)$/.test(s) })
    c.mutate(tmp)
    try {
      out = execFileSync('node', [CHECK, tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`
      code = typeof e.status === 'number' ? e.status : 1
    }
    const ok = c.expectCode === null
      ? (code === 0 && /0 problems/.test(out))
      : (code !== 0 && out.includes(c.expectCode))
    return { ok, code, line: `${ok ? 'ok  ' : 'FAIL'} ${c.name} → 期望 ${c.expectCode ?? '无问题(exit 0)'}，实得 exit=${code}${c.expectCode && !out.includes(c.expectCode) ? '（未报出该 code）' : ''}` }
  } catch (e) {
    return { ok: false, code, line: `FAIL ${c.name} → 样本自身出错：${e.message}` }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const results = new Array(CASES.length)
let next = 0
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, CASES.length) }, async () => {
  while (next < CASES.length) {
    const i = next++
    results[i] = runCase(CASES[i])
  }
}))

let bad = 0
for (const r of results) { if (!r.ok) bad++; console.log(r.line) }
console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${CASES.length - bad}/${CASES.length} 门禁对照样本按预期（并发 ${CONCURRENCY}）`)
process.exit(bad === 0 ? 0 : 1)
