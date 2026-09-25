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

// 覆盖率计量：记录"哪个检查读过哪个文件"。--coverage 会据此给出
// 「只被通用扫描器读过」与「没人读过」的清单 —— 盲区应当是可见的，不是靠感觉。
const touched = new Map()   // relPath -> Set<checkId>
const relOf = p => (p.startsWith(dir) ? p.slice(dir.length + 1) : p)
const mark = (checkId, p) => {
  if (!p) return
  const r = relOf(p)
  if (!touched.has(r)) touched.set(r, new Set())
  touched.get(r).add(checkId)
}

const DIMENSIONS = ['experts', 'teamTemplates', 'outputTemplates', 'qualityPolicies',
  'scenarios', 'methodPacks', 'toolProviders', 'knowledgeProviders', 'domainKnowledge', 'skillPackages']

const problems = []
const notes = []
let absentBannedTokens = []   // strict：真缺口（供 --json 全量给出）
let allowlistedTokens = []    // 通用术语：明确【不得】写入禁例，故不计入缺口
let reviewPendingTokens = []  // 待人工判定的"疑似通用"词干
let coverage = null           // --coverage 的计量结果
const fail = (code, where, msg) => problems.push(`${code} @ ${where} :: ${msg}`)

/** 维度键是 camelCase，目录名是 kebab-case（knowledgeProviders ↔ knowledge-providers）。 */
const dirNameOf = key => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** 维度 → 源文件清单（只列表，不读内容）。覆盖率的读者关心"源文件有没有被判据看过"，
 *  而判据读的是"装好的对象" —— 二者在这里对上。注意：有平台校验器时不会走 loadRawPack，
 *  故清单必须独立于它生成，否则本地跑覆盖率会全线漏报。 */
const dimFiles = {}
for (const k of DIMENSIONS) {
  const d = resolve(dir, dirNameOf(k))
  dimFiles[k] = existsSync(d) ? readdirSync(d).filter(n => n.endsWith('.json')).sort().map(f => resolve(d, f)) : []
}

/** 直接从 JSON 文件装包：与平台校验器无关，故第三方/CI 无私有库也能跑完这些检查。 */
function loadRawPack(root) {
  mark('load', join(root, 'pack.json'))
  const out = { pack: JSON.parse(readText(join(root, 'pack.json'))) }
  for (const k of DIMENSIONS) {
    const d = resolve(root, dirNameOf(k))
    out[k] = []
    if (!existsSync(d)) continue
    for (const f of readdirSync(d).filter(n => n.endsWith('.json')).sort()) {
      const abs = resolve(d, f)
      mark('load', abs)
      try { out[k].push(JSON.parse(readText(abs))) }
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
  notes.push(`skip 平台校验器未运行：未找到 ${LIB} ⇒ 少一层平台侧诊断；其余检查全部照跑（3/4/5/6 改用"直读 JSON"的结果，口径见各自实现）—— 设 EXPERT_LIB_ROOT 可启用`)
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
mark('version-lockstep', join(dir, 'pack.json'))
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
// 平台层解析的能力按【能力】聚合成一条 note：同一能力出现在 2 个场景里就是 2 条重复噪声，
// 而噪声会把真正的告警淹掉（note 合并后由"按场景列出"改为"按能力列出 + 出现场景"）。
const platformResolved = new Map()
for (const s of pack.scenarios ?? []) {
  for (const cap of s.toolPolicy?.allowed ?? []) {
    if (toolCaps.size > 0 && !toolCaps.has(cap)) {
      if (!platformResolved.has(cap)) platformResolved.set(cap, [])
      platformResolved.get(cap).push(s.id)
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
if (platformResolved.size) {
  const parts = [...platformResolved].map(([cap, scens]) => `"${cap}"（${scens.join('/')}）`)
  notes.push(`note ${platformResolved.size} 个 toolPolicy.allowed 能力未由本包 toolProvider 声明，走【平台 provider 层】解析：${parts.join('、')}`)
}

// ---------------------------------------------------------------- 7. bannedTokens derived from knowledge manifest
// 三类分开算，缺一类都会让这条检查失真：
//   covered   —— 已被禁例 token 覆盖（按词干重叠判定）
//   allowlist —— 通用术语，明确【不得】入禁例（入了会让合法散文误报）
//   review    —— 题意含糊、待人工判定（有上限）
//   strict    —— 其余未覆盖的专名/篇名 = 真缺口（阈值 0，超了即 FAIL）
const manifestPath = resolve(dir, 'source/SOURCE-MANIFEST.json')
if (existsSync(manifestPath)) {
  mark('banned-tokens', manifestPath)
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
    mark('doc-version', resolve(dir, 'README.md'))
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
    mark('doc-version', resolve(dir, 'SUBMISSION-CHECKLIST.md'))
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
    mark('digest', abs)
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
  // 显式豁免：**行首注释**写 `check-pack-allow: placeholder-residue` 即整文件跳过，并【打印一条 note】。
  // 必须是行首注释而不是任意出现 —— 否则"提及这个标记"（文档里写它、或本文件的正则字面量）会被当成"声明"，
  // 又回到 use/mention 混淆。豁免是声明的、可 grep 的、可见的。
  const EXEMPT = /^[ \t]*(?:\/\/|#|<!--)[ \t]*check-pack-allow:[ \t]*placeholder-residue/m
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(d, e.name)); continue }
      if (!EXT.test(e.name)) continue
      const abs = join(d, e.name)
      const rel = abs.slice(dir.length + 1)
      mark('placeholder-scan', abs)
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
    mark('file-ref', manifestPath)
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
    mark('contract', csvPath)
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

// ---------------------------------------------------------------- 13. 引用完整性（平台无关兜底）
// 为什么需要它：3/4/5/6 依赖平台校验器，而 CI 里没有私有库 ⇒ 那几条在 CI 中是 skip。
// 若不做这层兜底，"引用了不存在的东西"在 CI 上就是全盲（本地能拦、CI 拦不住 = 最坏的组合）。
{
  const ids = k => new Set((pack[k] ?? []).map(e => e.id))
  const expertIds = ids('experts'), otIds = ids('outputTemplates'), qpIds = ids('qualityPolicies')
  const ttIds = ids('teamTemplates'), kpIds = ids('knowledgeProviders'), spIds = ids('skillPackages')
  const capIds = new Set((pack.toolProviders ?? []).flatMap(p => (p.capabilities ?? []).map(c => c.capability)))
  const CONTRIB = {
    methodPacks: ids('methodPacks'), knowledgeProviders: kpIds, outputTemplates: otIds,
    qualityPolicies: qpIds, teamTemplates: ttIds, toolRequirements: capIds,
  }
  for (const sp of pack.skillPackages ?? []) {
    for (const [k, list] of Object.entries(sp.contributions ?? {})) {
      const target = CONTRIB[k]
      if (!target) { notes.push(`note skillPackages.${sp.id}.contributions 含未纳入校验的类别 "${k}"（请把它加进 CONTRIB 映射）`); continue }
      for (const ref of list ?? []) {
        if (!target.has(ref)) fail('skill-contribution-target-missing', `skillPackages.${sp.id}.contributions.${k}`, `"${ref}" 不在 ${k} 维度中`)
      }
    }
  }
  for (const s of pack.scenarios ?? []) {
    if (s.teamTemplate && !ttIds.has(s.teamTemplate)) fail('scenario-reference-missing', `scenarios.${s.id}`, `teamTemplate "${s.teamTemplate}" 不存在`)
    if (s.outputTemplate && !otIds.has(s.outputTemplate)) fail('scenario-reference-missing', `scenarios.${s.id}`, `outputTemplate "${s.outputTemplate}" 不存在`)
    if (s.qualityPolicy && !qpIds.has(s.qualityPolicy)) fail('scenario-reference-missing', `scenarios.${s.id}`, `qualityPolicy "${s.qualityPolicy}" 不存在`)
    if (s.skill?.id && !spIds.has(s.skill.id)) fail('scenario-reference-missing', `scenarios.${s.id}.skill`, `skill "${s.skill.id}" 不在 skillPackages 中`)
    for (const t of s.tasks ?? []) {
      if (t.expert && !expertIds.has(t.expert)) fail('scenario-reference-missing', `scenarios.${s.id}.tasks.${t.id}`, `expert "${t.expert}" 不存在`)
    }
  }
  // 技能目录内被 SKILL.md 点名的文件必须真的在
  for (const sp of pack.skillPackages ?? []) {
    if (sp.source?.kind !== 'workspace' || !sp.source?.root) continue
    const skillMd = resolve(dir, sp.source.digestTarget ?? `${sp.source.root}/SKILL.md`)
    if (!existsSync(skillMd)) continue            // 缺 SKILL.md 由 digest 检查负责报
    mark('ref-integrity', skillMd)
    const refs = new Set([...readText(skillMd).matchAll(/(?:^|[\s`(])((?:references|scripts|assets)\/[A-Za-z0-9._\-/]+)/g)]
      .map(m => m[1].replace(/[.,)]+$/, '')))
    for (const r of refs) {
      if (!existsSync(resolve(dir, sp.source.root, r))) fail('skill-reference-missing', `${sp.source.root}/${r}`, 'SKILL.md 引用了不存在的文件')
    }
  }
  // local-cli transport 的路径型参数必须存在（声明即承诺可执行）
  for (const p of pack.toolProviders ?? []) {
    for (const t of p.transports ?? []) {
      for (const a of t.args ?? []) {
        if (a.includes('/') && /\.[A-Za-z0-9]+$/.test(a)) mark('ref-integrity', resolve(dir, a))
        if (a.includes('/') && /\.[A-Za-z0-9]+$/.test(a) && !existsSync(resolve(dir, a))) {
          fail('transport-target-missing', `toolProviders.${p.id}.transports.${t.id}`, `args 里的路径不存在：${a}`)
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 15. 结构（平台无关的内容判据）
// 14 的覆盖率报表第一次跑就暴露了盲区：experts / method-packs / output-templates / domain-knowledge
// 这些【内容】文件此前只被"读入 + 占位符扫描"碰过，没有任何针对性判据（CI 模式下平台校验器也不在）。
// 本节按维度声明"必须有什么"，把内容层从"没人看"变成"有人看"。
{
  const STRUCTURE = {
    experts: { required: ['id', 'version', 'schemaVersion', 'display', 'persona', 'methods'], lists: ['methods'] },
    // 三个方法包的"内容字段"名各不相同（dual-gates→gates／nine-layer→layers／six-step→steps）
    // ⇒ 契约只能是"至少有一个非空数组"，而不是某个具体字段名（先按实测改契约，不按契约改内容）。
    methodPacks: { required: ['id', 'version', 'schemaVersion', 'name'], lists: [], atLeastOneList: true },
    outputTemplates: { required: ['id', 'version', 'schemaVersion', 'sections', 'documentStructure'], lists: ['sections'] },
    qualityPolicies: { required: ['id', 'version', 'schemaVersion', 'gates'], lists: ['gates'] },
    teamTemplates: { required: ['id', 'version', 'schemaVersion', 'slots', 'tasks'], lists: ['slots', 'tasks'] },
    scenarios: { required: ['id', 'version', 'schemaVersion', 'tasks'], lists: ['tasks'] },
    toolProviders: { required: ['id', 'version', 'schemaVersion', 'capabilities'], lists: ['capabilities'] },
    knowledgeProviders: { required: ['id', 'version', 'schemaVersion', 'capabilities'], lists: ['capabilities'] },
    domainKnowledge: { required: ['id', 'version', 'schemaVersion', 'collections'], lists: ['collections'] },
    skillPackages: { required: ['id', 'version', 'schemaVersion', 'source'], lists: [] },
  }
  for (const [dim, spec] of Object.entries(STRUCTURE)) {
    for (const e of pack[dim] ?? []) {
      const where = `${dim}.${e.id ?? '?'}`
      for (const k of spec.required) {
        if (e[k] === undefined || e[k] === null) fail('structure-missing-field', where, `缺字段 ${k}`)
      }
      for (const k of spec.lists) {
        if (!Array.isArray(e[k]) || e[k].length === 0) fail('structure-empty-list', where, `${k} 必须是非空数组`)
      }
      if (spec.atLeastOneList) {
        const nonEmpty = Object.entries(e).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k]) => k)
        if (nonEmpty.length === 0) fail('structure-empty-list', where, '至少要有一个非空数组字段（内容为空）')
      }
    }
  }
  // 质量门禁：每道门要能被调度，就必须有 id / kind / severity / appliesTo
  for (const pol of pack.qualityPolicies ?? []) {
    for (const g of pol.gates ?? []) {
      const where = `qualityPolicies.${pol.id}.gates.${g.id ?? '?'}`
      for (const k of ['id', 'kind', 'severity']) if (!g[k]) fail('structure-gate-missing-field', where, `门禁缺字段 ${k}`)
      if (!Array.isArray(g.appliesTo) || g.appliesTo.length === 0) fail('structure-gate-missing-field', where, 'appliesTo 必须是非空数组')
    }
  }
  // 输出模板：documentStructure 里声明的章节要有 name/required
  for (const t of pack.outputTemplates ?? []) {
    const ds = t.documentStructure
    const secs = Array.isArray(ds?.sections) ? ds.sections : null
    if (!secs) { fail('structure-document-structure', `outputTemplates.${t.id}`, 'documentStructure.sections 必须是数组'); continue }
    for (const [i, sec] of secs.entries()) {
      if (!sec?.name) fail('structure-document-structure', `outputTemplates.${t.id}.documentStructure.sections[${i}]`, '缺 name')
      if (typeof sec?.required !== 'boolean') fail('structure-document-structure', `outputTemplates.${t.id}.documentStructure.sections[${i}]`, 'required 必须是布尔值')
    }
  }
  // 方法包：步骤编号不重复
  for (const m of pack.methodPacks ?? []) {
    const nums = (m.steps ?? []).map(x => x.step)
    if (new Set(nums).size !== nums.length) fail('structure-duplicate-step', `methodPacks.${m.id}`, `steps.step 有重复：${nums.join(',')}`)
  }
  // 本体 collection：root 不在仓内时必须显式说明（否则读者会以为缺文件）
  for (const kb of pack.domainKnowledge ?? []) {
    for (const c of kb.collections ?? []) {
      const abs = resolve(dir, c.root ?? '')
      if ((!c.root || !existsSync(abs)) && !c.note) {
        fail('structure-collection-root', `domainKnowledge.${kb.id}.collections.${c.id}`, `root "${c.root}" 在仓内不存在，且未用 note 说明（读者会误判为缺文件）`)
      }
      if (c.root) mark('structure', abs)
    }
  }
  // .gitattributes 必须钉行尾：digest 目标是 sha256(SKILL.md)，CRLF 会让 digest 全体错位
  const gaPath = resolve(dir, '.gitattributes')
  mark('structure', gaPath)
  if (!existsSync(gaPath)) fail('structure-gitattributes', '.gitattributes', '缺失：行尾策略未声明，跨平台 digest 不稳定')
  else if (!/eol=lf/.test(readText(gaPath))) fail('structure-gitattributes', '.gitattributes', '未声明 eol=lf')
}

// ---------------------------------------------------------------- 13b. 覆盖率归属（对象→源文件）
// 判据读的是"装好的对象"，覆盖率的读者关心的是"源文件有没有被判据看过"。
// 这里把二者如实对应起来：某维度被判据 X 查过 ⇒ 其源文件记为被 X 覆盖。
{
  const BY_CHECK = {
    'gates-binding': ['teamTemplates', 'qualityPolicies'],
    dag: ['teamTemplates', 'scenarios'],
    'scenario-dag': ['scenarios', 'teamTemplates'],
    'policy-resolution': ['scenarios', 'knowledgeProviders', 'toolProviders'],
    structure: Object.keys({
      experts: 1, methodPacks: 1, outputTemplates: 1, qualityPolicies: 1, teamTemplates: 1,
      scenarios: 1, toolProviders: 1, knowledgeProviders: 1, domainKnowledge: 1, skillPackages: 1,
    }),
    'ref-integrity': ['scenarios', 'skillPackages', 'toolProviders', 'outputTemplates', 'qualityPolicies', 'teamTemplates', 'methodPacks', 'knowledgeProviders'],
  }
  for (const [checkId, dims] of Object.entries(BY_CHECK)) {
    for (const d of dims) for (const f of dimFiles[d] ?? []) mark(checkId, f)
  }
}

// ---------------------------------------------------------------- 15b. 脚本/文档/杂项完整性
// 覆盖率报表把这些文件标成"没人看"，本节点掉它们：
//   scripts/*.mjs|sh|py  —— 语法可编译（能被 require/执行）
//   *.md 与 workflow    —— 点名的 scripts/ 路径必须存在（文档引用烂链接）
//   workflow            —— 必须像一份 workflow（有 on: 与 jobs:）
//   .gitignore          —— 必须忽略运行目录与 __pycache__（否则运行数据会被误提交）
//   LICENSE             —— 必须与包内声明的 license 一致
{
  const fsMod = await import('node:fs')
  const { execFileSync } = await import('node:child_process')
  const syntax = (rel, kind) => {
    const abs = resolve(dir, rel)
    mark('scripts-syntax', abs)
    try {
      if (kind === 'mjs') execFileSync(process.execPath, ['--check', abs], { stdio: 'ignore' })
      else if (kind === 'sh') execFileSync('bash', ['-n', abs], { stdio: 'ignore' })
      else if (kind === 'py') execFileSync('python3', ['-c', `import sys;compile(open(sys.argv[1],encoding="utf-8").read(),sys.argv[1],"exec")`, abs], { stdio: 'ignore' })
    } catch (e) {
      fail('script-syntax-error', rel, `${kind} 语法检查未通过（exit=${e.status ?? '?'}）`)
    }
  }
  const walkScripts = d => {
    for (const e of fsMod.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['__pycache__', '.git', 'engine'].includes(e.name)) walkScripts(join(d, e.name)); continue }
      const rel = relOf(join(d, e.name))
      if (e.name.endsWith('.mjs') || e.name.endsWith('.js')) syntax(rel, 'mjs')
      else if (e.name.endsWith('.sh')) syntax(rel, 'sh')
      else if (e.name.endsWith('.py')) syntax(rel, 'py')
    }
  }
  for (const d of ['scripts', 'skills']) { const abs = resolve(dir, d); if (existsSync(abs)) walkScripts(abs) }

  // 文档/workflow 里点名的 scripts/ 路径必须存在
  const docFiles = []
  const walkDocs = d => {
    for (const e of fsMod.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['__pycache__', '.git', 'engine'].includes(e.name)) walkDocs(join(d, e.name)); continue }
      if (/\.(md|ya?ml)$/.test(e.name)) docFiles.push(join(d, e.name))
    }
  }
  walkDocs(dir)
  for (const abs of docFiles) {
    const rel = relOf(abs)
    mark('doc-script-ref', abs)
    const text = readText(abs)
    for (const m of text.matchAll(/(?:^|[\s`(])(scripts\/[A-Za-z0-9._\-/]+\.(?:mjs|sh|py))/g)) {
      const ref = m[1].replace(/[.,)]+$/, '')
      if (!existsSync(resolve(dir, ref))) fail('doc-script-ref-missing', rel, `文档点名了不存在的脚本：${ref}`)
    }
  }
  // workflow 结构
  const wfDir = resolve(dir, '.github/workflows')
  if (existsSync(wfDir)) {
    for (const f of fsMod.readdirSync(wfDir).filter(n => /\.ya?ml$/.test(n))) {
      const rel = `.github/workflows/${f}`
      mark('workflow-basic', resolve(dir, rel))
      const t = readText(resolve(dir, rel))
      if (!/^on:/m.test(t)) fail('workflow-basic', rel, '缺 on: 触发声明')
      if (!/^jobs:/m.test(t)) fail('workflow-basic', rel, '缺 jobs:')
    }
  }
  // .gitignore：必须忽略运行目录与 __pycache__
  const gi = resolve(dir, '.gitignore')
  mark('gitignore-rule', gi)
  if (!existsSync(gi)) fail('gitignore-rule', '.gitignore', '缺失')
  else {
    const t = readText(gi)
    for (const pat of ['__pycache__', 'engine/']) {
      if (!t.includes(pat)) fail('gitignore-rule', '.gitignore', `未忽略 ${pat} ⇒ 运行数据/字节码可能被提交`)
    }
  }
  // LICENSE 与包内声明的 license 一致
  const licPath = resolve(dir, 'LICENSE')
  mark('license-consistency', licPath)
  const declaredLic = new Set((pack.skillPackages ?? []).map(p => p.source?.license).filter(Boolean))
  if (!existsSync(licPath)) fail('license-consistency', 'LICENSE', '缺失')
  else if (declaredLic.size && ![...declaredLic].every(l => readText(licPath).includes(l))) {
    fail('license-consistency', 'LICENSE', `LICENSE 文本与包内声明不一致：声明 ${[...declaredLic].join('/')}`)
  }
}

// ---------------------------------------------------------------- 14. 覆盖率（--coverage）
// 盲区应当是可见的：分清「有针对性判据读过」「只被通用扫描器读过」「没人读过」。
if (ARGV.includes('--coverage')) {
  const GENERIC = new Set(['placeholder-scan', 'load'])
  const SKIP = new Set(['.git', 'engine', '__pycache__', 'node_modules'])
  const all = []
  const walkAll = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walkAll(join(d, e.name)); continue }
      all.push(relOf(join(d, e.name)))
    }
  }
  if (existsSync(dir)) walkAll(dir)
  const targeted = [], scanOnly = [], untouched = []
  for (const f of all.sort()) {
    const ids = touched.get(f)
    if (!ids) { untouched.push(f); continue }
    if ([...ids].some(i => !GENERIC.has(i))) targeted.push(f)
    else scanOnly.push(f)
  }
  notes.push(`note 覆盖率：${all.length} 个文件 —— 有针对性判据 ${targeted.length} ／ 仅通用扫描 ${scanOnly.length} ／ 没人读 ${untouched.length}`)
  coverage = {
    filesTotal: all.length,
    targeted, scanOnly, untouched,
    perCheck: Object.fromEntries(
      [...new Set([...touched.values()].flatMap(s => [...s]))].sort()
        .map(id => [id, [...touched.values()].filter(v => v.has(id)).length])),
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
      ...(coverage ? { coverage } : {}),
    }, null, 1))
    return
  }
  console.log(`pack: ${dir}`)
  console.log(`version: ${pack.pack?.version ?? '?'}`)
  console.log('dimensions: ' + sections[0].map(k => `${k}=${num(k)}`).join(' '))
  console.log()
  for (const n of notes) console.log('  · ' + n)
  if (coverage) {
    console.log()
    console.log(`覆盖率（--coverage）：共 ${coverage.filesTotal} 个文件 —— 有针对性判据 ${coverage.targeted.length} ／ 仅通用扫描 ${coverage.scanOnly.length} ／ 没人读 ${coverage.untouched.length}`)
    const show = (label, list) => { if (list.length) console.log(`  ${label}（${list.length}）：${list.slice(0, 12).join('、')}${list.length > 12 ? ' …' : ''}`) }
    show('仅通用扫描（无针对性判据）', coverage.scanOnly)
    show('没人读', coverage.untouched)
    console.log('  各检查覆盖文件数：' + Object.entries(coverage.perCheck).map(([k, v]) => `${k}=${v}`).join('  '))
  }
  if (problems.length === 0) {
    console.log(`\n✓ 0 problems${notes.length ? `, ${notes.length} note(s)` : ''}`)
  } else {
    for (const p of problems) console.log('  ✗ ' + p)
    console.log(`\n✗ ${problems.length} problem(s)`)
  }
}

report()
process.exit(problems.length === 0 ? 0 : 1)
