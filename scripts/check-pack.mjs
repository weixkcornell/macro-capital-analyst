#!/usr/bin/env node
/**
 * Pack self-check for macro-capital-analyst.
 *
 * Runs the platform domain-pack validator, then adds the cross-dimension
 * binding checks that `validateDomainPack` deliberately leaves to later
 * binding resolution — the gaps that let broken references ship silently.
 *
 * Usage:  node scripts/check-pack.mjs [packDir] [--json]
 * Env:    EXPERT_LIB_ROOT  path to @deepseek-ai/dsh-expert-library (default below)
 *
 * `--json` 只把 {version, problems, notes} 打到 stdout（供脚本/CI 读），人读输出关闭。
 * notes 里含"人工清单落后于知识底座"这类**可行动**告警，全量给出、不截断。
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const LIB = process.env.EXPERT_LIB_ROOT ?? '/root/zhijian/dsh-expert-library'
const ARGV = process.argv.slice(2)
const AS_JSON = ARGV.includes('--json')
const dir = resolve(ARGV.find(a => !a.startsWith('--')) ?? '.')

/** 统一剥离 UTF-8 BOM。CSV/JSON 带 BOM 时，第一个键名会变成 "\uFEFFxxx"（静默错名）。 */
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')

const DIMENSIONS = ['experts', 'teamTemplates', 'outputTemplates', 'qualityPolicies',
  'scenarios', 'methodPacks', 'toolProviders', 'knowledgeProviders', 'domainKnowledge', 'skillPackages']

const problems = []
const notes = []
let absentBannedTokens = []   // strict：真缺口（供 --json 全量给出）
let allowlistedTokens = []    // 通用术语：明确【不得】写入禁例，故不计入缺口
let reviewPendingTokens = []  // 待人工判定的"疑似通用"词干
const fail = (code, where, msg) => problems.push(`${code} @ ${where} :: ${msg}`)

/** 维度键是 camelCase，目录名是 kebab-case（knowledgeProviders ↔ knowledge-providers）。 */
const dirNameOf = key => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** 直接从 JSON 文件装包：与平台校验器无关，故第三方/CI 无私有库也能跑完这些检查。 */
function loadRawPack(root) {
  const out = { pack: JSON.parse(readText(join(root, 'pack.json'))) }
  for (const k of DIMENSIONS) {
    const d = resolve(root, dirNameOf(k))
    out[k] = []
    if (!existsSync(d)) continue
    for (const f of readdirSync(d).filter(n => n.endsWith('.json')).sort()) {
      try { out[k].push(JSON.parse(readText(resolve(d, f)))) }
      catch (e) { fail('json-unparseable', `${k}/${f}`, e.message) }
    }
  }
  return out
}

// ---------------------------------------------------------------- 1. 平台校验器（可选）
// 私有平台库只在本地/平台侧存在 ⇒ 缺失时【跳过并声明】，不再 exit 2。
// 这样 CI 与第三方贡献者仍能跑完 2/7/8/9/10/11/12 全部与平台无关的检查。
let validatorRan = false
let validatorPack = null
if (!existsSync(resolve(LIB, 'lib/v2/index.js'))) {
  notes.push(`skip 平台校验器未运行：未找到 ${LIB}（检查 3/4/5/6 依赖它；其余检查照跑）—— 设 EXPERT_LIB_ROOT 可启用`)
} else {
  const require = createRequire(LIB + '/')
  const v2 = require(resolve(LIB, 'lib/v2/index.js'))
  const res = v2.loadPackFromDirSync(dir, { layer: 'domain-pack', label: dir })
  for (const d of res.diagnostics) {
    if (d.severity === 'error') fail(d.code, d.path, d.message)
    else notes.push(`warn ${d.code} @ ${d.path} :: ${d.message}`)
  }
  validatorRan = Boolean(res.pack)
  validatorPack = res.pack ?? null
  if (!res.pack) notes.push('skip 平台校验器未能装包（诊断见上）⇒ 3/4/5/6 未运行；其余检查照跑')
}

// 包对象：优先用校验器归一化后的包（保持与历史行为一致）；缺失时回落到"直接读 JSON"。
const pack = validatorPack ?? loadRawPack(dir)
const num = key => (pack[key] ?? []).length

// ---------------------------------------------------------------- 2. version lockstep
const versions = new Map()
const addVer = (where, v) => {
  if (typeof v !== 'string') { fail('missing-version', where, 'entity has no version'); return }
  if (!versions.has(v)) versions.set(v, [])
  versions.get(v).push(where)
}
for (const key of ['experts', 'teamTemplates', 'outputTemplates', 'qualityPolicies', 'scenarios', 'methodPacks', 'toolProviders', 'knowledgeProviders', 'domainKnowledge', 'skillPackages']) {
  for (const e of pack[key] ?? []) addVer(`${key}.${e.id}`, e.version)
}
if (pack.pack?.version) addVer('pack.json', pack.pack.version)
if (versions.size > 1) {
  fail('version-drift', 'pack', `pack version "${pack.pack?.version}" but entities carry ${[...versions.keys()].filter(v => v !== pack.pack?.version).join(', ')}`)
}

// ---------------------------------------------------------------- 3. gates: declared vs bound
const gateIds = new Set()
for (const p of pack.qualityPolicies ?? []) for (const g of p.gates ?? []) gateIds.add(g.id)
const bound = new Set()
for (const t of pack.teamTemplates ?? []) {
  for (const b of t.gates ?? []) {
    const policy = (pack.qualityPolicies ?? []).find(p => p.id === b.policy)
    if (!policy) fail('dangling-gate-policy', `teamTemplates.${t.id}.gates`, `policy "${b.policy}" not found`)
    else if (!(policy.gates ?? []).some(g => g.id === b.gate)) {
      fail('dangling-gate', `teamTemplates.${t.id}.gates`, `gate "${b.gate}" not found in policy "${b.policy}"`)
    } else bound.add(b.gate)
  }
}
for (const g of gateIds) {
  if (!bound.has(g)) fail('unbound-gate', 'qualityPolicies', `gate "${g}" is declared but no team template binds it — it can never run`)
}

// ---------------------------------------------------------------- 4. DAG integrity
for (const t of pack.teamTemplates ?? []) {
  const slotIds = new Set((t.slots ?? []).map(s => s.id))
  const byId = new Map()
  for (const task of t.tasks ?? []) {
    if (byId.has(task.id)) fail('duplicate-task-id', `teamTemplates.${t.id}`, `task id "${task.id}" duplicated`)
    byId.set(task.id, task)
    if (!slotIds.has(task.role)) fail('dangling-role', `teamTemplates.${t.id}.tasks.${task.id}`, `role "${task.role}" matches no slot`)
  }
  for (const task of t.tasks ?? []) {
    for (const dep of task.dependsOn ?? []) {
      if (!byId.has(dep)) fail('dangling-dependency', `teamTemplates.${t.id}.tasks.${task.id}`, `depends on unknown task "${dep}"`)
    }
  }
  // cycle detection
  const state = new Map()
  const walk = (id, path) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'open') { fail('dependency-cycle', `teamTemplates.${t.id}`, `cycle: ${[...path, id].join(' -> ')}`); return }
    state.set(id, 'open')
    for (const d of byId.get(id)?.dependsOn ?? []) if (byId.has(d)) walk(d, [...path, id])
    state.set(id, 'done')
  }
  for (const id of byId.keys()) walk(id, [])
}

// ---------------------------------------------------------------- 5. scenario <-> team template DAG agreement
for (const s of pack.scenarios ?? []) {
  if (!s.teamTemplate) continue
  const t = (pack.teamTemplates ?? []).find(x => x.id === s.teamTemplate)
  if (!t) continue
  const templateIds = (t.tasks ?? []).map(x => x.id)
  const scenTasks = s.tasks ?? []
  if (scenTasks.length !== templateIds.length) {
    fail('dag-length-mismatch', `scenarios.${s.id}.tasks`, `scenario has ${scenTasks.length} tasks, team template has ${templateIds.length}`)
    continue
  }
  // scenario.tasks is index-addressed by the V1 compat layer; ids must line up positionally
  for (const [i, task] of scenTasks.entries()) {
    if (task.id !== undefined && task.id !== templateIds[i]) {
      fail('dag-task-mismatch', `scenarios.${s.id}.tasks[${i}]`, `id "${task.id}" != team template task "${templateIds[i]}"`)
    }
    for (const dep of task.dependsOn ?? []) {
      if (!Number.isInteger(dep) || dep < 0 || dep >= scenTasks.length) {
        fail('dangling-index-dependency', `scenarios.${s.id}.tasks[${i}].dependsOn`, `index ${JSON.stringify(dep)} out of range`)
      }
    }
    if (task.expert === undefined) fail('missing-expert', `scenarios.${s.id}.tasks[${i}]`, 'V1 compat requires task.expert')
  }
  // dependency graphs must be equivalent after normalising both to task ids.
  // scenario.tasks uses integer indices (V1 compat); team template uses string ids.
  const indexOfId = new Map(templateIds.map((id, i) => [id, i]))
  const normalize = deps => deps.map(d => (Number.isInteger(d) ? templateIds[d] : d)).filter(d => d !== undefined)
  const closureById = tasks => {
    const by = new Map(tasks.map((x, i) => [templateIds[i], x]))
    const out = new Map()
    for (const id of by.keys()) {
      const seen = new Set()
      const stack = [id]
      while (stack.length) {
        for (const d of normalize(by.get(stack.pop())?.dependsOn ?? [])) {
          if (!seen.has(d)) { seen.add(d); stack.push(d) }
        }
      }
      out.set(id, seen)
    }
    return out
  }
  const cs = closureById(scenTasks)
  const ct = closureById(t.tasks ?? [])
  for (const [id, deps] of cs) {
    const a = [...deps].sort().join(',')
    const b = [...(ct.get(id) ?? [])].sort().join(',')
    if (a !== b) {
      fail('dag-divergence', `scenarios.${s.id}.tasks[${indexOfId.get(id)}]`, `transitive deps [${a}] != team template [${b}]`)
    }
  }
  // skill binding must point at an existing task, and index/id must agree
  if (s.skill?.appliesToTaskIndex !== undefined) {
    const idx = s.skill.appliesToTaskIndex
    if (!Number.isInteger(idx) || idx < 0 || idx >= scenTasks.length) {
      fail('skill-task-out-of-range', `scenarios.${s.id}.skill`, `appliesToTaskIndex ${idx} out of range`)
    } else if (s.skill.appliesToTaskId !== undefined && s.skill.appliesToTaskId !== templateIds[idx]) {
      fail('skill-task-mismatch', `scenarios.${s.id}.skill`, `appliesToTaskId "${s.skill.appliesToTaskId}" != task at index ${idx} ("${templateIds[idx]}")`)
    }
  }
}

// ---------------------------------------------------------------- 6. tool / knowledge policy resolution
const toolCaps = new Set()
for (const p of pack.toolProviders ?? []) for (const c of p.capabilities ?? []) toolCaps.add(c.capability)
const knowledgeCaps = new Set() // eslint-disable-line
for (const p of pack.knowledgeProviders ?? []) for (const c of p.capabilities ?? []) knowledgeCaps.add(c)
for (const s of pack.scenarios ?? []) {
  for (const cap of s.toolPolicy?.allowed ?? []) {
    if (toolCaps.size > 0 && !toolCaps.has(cap)) {
      notes.push(`note toolPolicy.allowed "${cap}" (scenario ${s.id}) is not declared by any pack toolProvider — resolved from the platform provider layer`)
    }
  }
  for (const need of s.knowledgePolicy?.required ?? []) {
    const [providerId, scope] = String(need).split(':')
    const provider = (pack.knowledgeProviders ?? []).find(p => p.id === providerId)
    if (!provider) {
      fail('dangling-knowledge-provider', `scenarios.${s.id}.knowledgePolicy`, `required "${need}" references unknown knowledge provider "${providerId}"`)
    } else if (scope !== undefined && Array.isArray(provider.scopes) && provider.scopes.length > 0 && !provider.scopes.includes(scope)) {
      fail('unknown-knowledge-scope', `scenarios.${s.id}.knowledgePolicy`, `provider "${providerId}" declares scopes [${provider.scopes.join(', ')}] but "${need}" asks for "${scope}"`)
    }
  }
}

// ---------------------------------------------------------------- 7. bannedTokens derived from knowledge manifest
// 三类分开算，缺一类都会让这条检查失真：
//   covered   —— 已被禁例 token 覆盖（按词干重叠判定）
//   allowlist —— 通用术语，明确【不得】入禁例（入了会让合法散文误报）
//   review    —— 题意含糊、待人工判定（有上限）
//   strict    —— 其余未覆盖的专名/篇名 = 真缺口（阈值 0，超了即 FAIL）
const manifestPath = resolve(dir, 'source/SOURCE-MANIFEST.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readText(manifestPath))
  // Normalise both sides the way a human would: drop subtitles and parentheticals,
  // keep the distinctive stem, then compare.
  const stem = s => String(s ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .split(/[：:——]|\s+—\s+/)[0]
    .trim()
  const expected = new Set()
  for (const m of manifest.materials ?? []) {
    const title = stem(m.title)
    if (title.length >= 4) expected.add(title)
    for (const part of String(m.author ?? '').split(/[、,]/)) {
      const v = stem(part)
      if (v.length >= 2) expected.add(v)
    }
  }
  const cfg = (pack.qualityPolicies ?? []).flatMap(p => (p.gates ?? [])).find(g => g.config?.bannedTokens)?.config ?? {}
  const declared = [...new Set((cfg.bannedTokens ?? []).map(t => String(t).trim()))]
  const allow = (cfg.bannedTokensAllowlist ?? []).map(t => String(t).trim())
  const review = (cfg.bannedTokensReview ?? []).map(t => String(t).trim())
  const policy = cfg.bannedTokensPolicy ?? {}
  const maxStrict = Number.isInteger(policy.maxStrictGaps) ? policy.maxStrictGaps : 0
  const maxReview = Number.isInteger(policy.maxReviewPending) ? policy.maxReviewPending : 5
  const hit = (list, v) => list.some(t => t.length >= 2 && (t.includes(v) || v.includes(t)))
  const covered = v => hit(declared, v)
  const inAllow = v => hit([...allow, ...review], v)   // review 项同样不计入 strict
  const strict = [...expected].filter(v => !covered(v) && !inAllow(v))
  absentBannedTokens = strict
  allowlistedTokens = [...expected].filter(v => !covered(v) && hit(allow, v))
  reviewPendingTokens = [...expected].filter(v => !covered(v) && hit(review, v))
  if (strict.length > maxStrict) {
    fail('banned-tokens-gap', 'qualityPolicies.banned-tokens',
      `${strict.length} 个专名/篇名词干未被禁例覆盖（阈值 ${maxStrict}）：${strict.slice(0, 6).join(' | ')}${strict.length > 6 ? ' …' : ''}`)
  }
  if (reviewPendingTokens.length > maxReview) {
    fail('banned-tokens-review-backlog', 'qualityPolicies.banned-tokens',
      `待人工判定的 token 有 ${reviewPendingTokens.length} 项超过上限 ${maxReview}：${reviewPendingTokens.join(' | ')}`)
  }
  if (strict.length === 0) {
    notes.push(`note bannedTokens 覆盖 ${expected.size}/${expected.size} 词干（禁例 ${declared.length} 条 / 通用术语豁免 ${allowlistedTokens.length} 条 / 待判定 ${reviewPendingTokens.length} 条）`)
  }
}

// ---------------------------------------------------------------- 8. doc version lockstep
// pack.json 不是版本的唯一载位：README 徽章、README 版本历史首条、SUBMISSION-CHECKLIST
// 各写一份。此前靠人工同步（README 徽章曾落后于 pack.json）⇒ 改成机器核对。
if (pack.pack?.version) {
  const declared = pack.pack.version

  if (existsSync(resolve(dir, 'README.md'))) {
    const md = readText(resolve(dir, 'README.md'))
    const badge = md.match(/badge\/Version-([^-\s]+)-/)
    if (!badge) fail('missing-version-badge', 'README.md', 'no shields.io Version badge found')
    else if (badge[1] !== declared) fail('doc-version-drift', 'README.md', `badge "${badge[1]}" != pack.json "${declared}"`)

    const hIdx = md.search(/^##\s*版本历史\s*$/m)
    if (hIdx < 0) fail('missing-version-history', 'README.md', 'no "## 版本历史" section')
    else {
      const hist = md.slice(hIdx)
      const head = hist.match(/^- \*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/m)
      if (!head) fail('missing-version-history', 'README.md', 'version history has no "- **X.Y.Z**" entry')
      else if (head[1] !== declared) fail('doc-version-drift', 'README.md', `history head "${head[1]}" != pack.json "${declared}"`)
      // bump-version.mjs 会插入占位条目，逼作者补发布说明；留着即 FAIL。
      const headLine = (hist.match(/^- \*\*[0-9]+\.[0-9]+\.[0-9]+\*\*.*$/m) ?? [''])[0]
      if (/待补发布说明/.test(headLine)) {
        fail('release-note-placeholder', 'README.md', `版本历史首条仍是占位（bump-version 生成）：${headLine.slice(0, 60)}`)
      }
    }
  } else fail('missing-readme', 'README.md', 'not found')

  if (existsSync(resolve(dir, 'SUBMISSION-CHECKLIST.md'))) {
    const cl = readText(resolve(dir, 'SUBMISSION-CHECKLIST.md'))
    const m = cl.match(/version=([0-9]+\.[0-9]+\.[0-9]+)/)
    if (!m) fail('missing-checklist-version', 'SUBMISSION-CHECKLIST.md', 'no "version=X.Y.Z" found')
    else if (m[1] !== declared) fail('doc-version-drift', 'SUBMISSION-CHECKLIST.md', `version=${m[1]} != pack.json "${declared}"`)
  } else fail('missing-checklist', 'SUBMISSION-CHECKLIST.md', 'not found')
}

// ---------------------------------------------------------------- 9. digest reproducibility
// 凡声明 digest 的实体，必须同时声明 digestTarget（用哪个文件算的），且当场复算相符。
// 缺 digestTarget ⇒ 该 digest 无法用任何可复现算法对应到现有内容 = 声明漂移
// （v2.3.0 修 skill-packages、v2.4.1 修 domain-knowledge snapshot，同一族两例）。
{
  const fs = await import('node:fs')
  const crypto = await import('node:crypto')
  const pairs = []
  const collect = (dim, pred, pick) => {
    const d = resolve(dir, dim)
    if (!existsSync(d)) return
    for (const f of fs.readdirSync(d).filter(n => n.endsWith('.json'))) {
      let obj
      try { obj = JSON.parse(fs.readFileSync(resolve(d, f), 'utf8')) } catch { continue }
      if (!pred(obj)) continue
      const p = pick(obj)
      pairs.push([`${dim}/${f}`, p.digest, p.digestTarget, p.digestAlgorithm])
    }
  }
  collect('skill-packages', o => o?.source?.digest, o => o.source)
  collect('domain-knowledge', o => o?.snapshot?.digest, o => o.snapshot)

  for (const [where, digest, target, algo] of pairs) {
    if (!target) {
      fail('digest-without-target', where, `digest ${String(digest).slice(0, 12)}… 未声明 digestTarget ⇒ 不可复算`)
      continue
    }
    const abs = resolve(dir, target)
    if (!existsSync(abs)) { fail('digest-target-missing', where, `digestTarget "${target}" 不存在`); continue }
    let got
    try { got = crypto.createHash(algo ?? 'sha256').update(fs.readFileSync(abs)).digest('hex') }
    catch (e) { fail('digest-algorithm-invalid', where, `digestAlgorithm "${algo}" 不可用: ${e.message}`); continue }
    if (got !== digest) {
      fail('digest-mismatch', where, `${target} 实算 ${got.slice(0, 12)}… != 声明 ${String(digest).slice(0, 12)}…`)
    }
  }
}

// ---------------------------------------------------------------- 10. 占位符残留（包自身，不只产物）
// 记法 vs 残留（本文件自己就写着这条规则，故必须能区分"提及"与"使用"）：
//   记法：空体 ／ 省略号 `…` ／ 含正则元字符（`(?!…)`、`[^】]` 这类模式写法）／ 尖括号体 `<具体内容>`
//   残留：其余 —— 即"写着具体内容却没被替换掉"。注入实测：`【替换：在此填来源】` 必被抓。
{
  const RESIDUE = /【替换：([^】]*)】/g
  // 引述域只认反引号与中文引号：**不能把 `"` 也算进来** —— JSON 的字符串值就包在 `"` 里，
  // 那会把"每个 JSON 里的残留"都豁免掉，门禁等于死掉（本版实测踩过一次）。
  const QUOTE_PAIRS = [['`', '`'], ['「', '」'], ['『', '』']]

  const isNotation = (text, m) => {
    const body = m[0].slice(4, -1)
    if (body === '' || body === '…') return true
    if (/[()\[\]{}\\*+?|^$.]/.test(body)) return true            // 正则模式写法，如 (?!…) / [^】]
    if (/^[<＜][^>＞]*[>＞]$/.test(body)) return true            // 尖括号占位写法，如 <具体内容>
    const before = text[m.index - 1], after = text[m.index + m[0].length]
    return QUOTE_PAIRS.some(([o, c]) => before === o && after === c)   // 引述域：被引号/反引号包住的"提及"
  }
  const SKIP_DIRS = new Set(['.git', 'engine', '__pycache__', 'node_modules'])
  const EXT = /\.(json|md|mjs|js|cjs|csv|ya?ml|py|sh|txt)$/
  // 显式豁免：文件里写了 `check-pack-allow: placeholder-residue` 即整文件跳过，并【打印一条 note】
  // ——豁免必须是声明的、可 grep 的、可见的；不做模式猜测（谁需要豁免谁写明）。
  const EXEMPT = /check-pack-allow:\s*placeholder-residue/
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(d, e.name)); continue }
      if (!EXT.test(e.name)) continue
      const abs = join(d, e.name)
      const rel = abs.slice(dir.length + 1)
      const text = readText(abs)
      if (EXEMPT.test(text)) { notes.push(`note ${rel} 声明了 placeholder-residue 豁免（该文件按设计含残留样本）；引用其检查结论时须带上这一条`); continue }
      const hits = [...text.matchAll(RESIDUE)].filter(m => !isNotation(m.input, m)).map(m => m[0])
      if (hits.length) fail('placeholder-residue', rel, `占位符残留 ${hits.length} 处：${hits.slice(0, 3).join(' ')}`)
    }
  }
  if (existsSync(dir)) walk(dir)
}

// ---------------------------------------------------------------- 11. fileRef 安全口径
// 不查存在性：38/38 材料按版权设计不随包分发（实测 fileRef 无一在仓内可解析）。
// 查的是"可解析规则是否声明"与"有没有把绝对路径/URL/内网地址写进包"。
{
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readText(manifestPath))
    if (!manifest.fileRefRoot) {
      fail('fileRef-root-undeclared', 'source/SOURCE-MANIFEST.json', '未声明 fileRefRoot ⇒ 读者无法知道 fileRef 相对哪个根解析')
    }
    const UNSAFE = /(^\/|^[A-Za-z]:\\|\\\\|https?:\/\/|(?:^|[^\d])(?:10|127|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.)/
    for (const m of manifest.materials ?? []) {
      for (const ref of String(m.fileRef ?? '').split('+').map(t => t.trim()).filter(Boolean)) {
        if (UNSAFE.test(ref)) fail('fileRef-unsafe', `materials.${m.id}`, `fileRef 含绝对路径/URL/内网地址：${ref}`)
      }
    }
  }
}

// ---------------------------------------------------------------- 12. 数据契约表 ↔ toolProviders（对照）
{
  const csvPath = resolve(dir, 'data-contracts/capability-contract.csv')
  if (existsSync(csvPath)) {
    const lines = readText(csvPath).split('\n').filter(l => l.trim())
    const csvCaps = lines.slice(1).map(l => l.split(',')[0].replace(/^\uFEFF/, '').trim()).filter(Boolean)
    const declaredCaps = new Set((pack.toolProviders ?? []).flatMap(p => (p.capabilities ?? []).map(c => c.capability)))
    const onlyCsv = csvCaps.filter(c => !declaredCaps.has(c))
    const onlyPack = [...declaredCaps].filter(c => !csvCaps.includes(c))
    if (onlyCsv.length || onlyPack.length) {
      notes.push(`note 数据契约表与 toolProviders 的 capability 名不完全对应（不同口径，非缺陷）：表内 ${csvCaps.length} 条（${onlyCsv.length} 条走平台层解析）／包内声明 ${declaredCaps.size} 条（${onlyPack.length} 条未入表）—— 关系见 tool-providers 的 note 字段`)
    }
  }
}

// ---------------------------------------------------------------- report
function report() {
  const sections = [
    ['experts', 'teamTemplates', 'outputTemplates', 'qualityPolicies', 'scenarios', 'methodPacks', 'toolProviders', 'knowledgeProviders', 'domainKnowledge', 'skillPackages'],
  ]
  if (AS_JSON) {
    console.log(JSON.stringify({
      pack: dir,
      version: pack.pack?.version ?? null,
      validatorRan,
      dimensions: Object.fromEntries(sections[0].map(k => [k, num(k)])),
      problems,
      notes,
      absentBannedTokens,      // strict：真缺口（专名/篇名，未覆盖）
      allowlistedTokens,       // 通用术语：明确不得入禁例
      reviewPendingTokens,     // 待人工判定
    }, null, 1))
    return
  }
  console.log(`pack: ${dir}`)
  console.log(`version: ${pack.pack?.version ?? '?'}`)
  console.log('dimensions: ' + sections[0].map(k => `${k}=${num(k)}`).join(' '))
  console.log()
  for (const n of notes) console.log('  · ' + n)
  if (problems.length === 0) {
    console.log(`\n✓ 0 problems${notes.length ? `, ${notes.length} note(s)` : ''}`)
  } else {
    for (const p of problems) console.log('  ✗ ' + p)
    console.log(`\n✗ ${problems.length} problem(s)`)
  }
}

report()
process.exit(problems.length === 0 ? 0 : 1)
