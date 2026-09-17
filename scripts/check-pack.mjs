#!/usr/bin/env node
/**
 * Pack self-check for macro-capital-analyst.
 *
 * Runs the platform domain-pack validator, then adds the cross-dimension
 * binding checks that `validateDomainPack` deliberately leaves to later
 * binding resolution — the gaps that let broken references ship silently.
 *
 * Usage:  node scripts/check-pack.mjs [packDir]
 * Env:    EXPERT_LIB_ROOT  path to @deepseek-ai/dsh-expert-library (default below)
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const LIB = process.env.EXPERT_LIB_ROOT ?? '/root/zhijian/dsh-expert-library'
const dir = resolve(process.argv[2] ?? '.')

if (!existsSync(resolve(LIB, 'lib/v2/index.js'))) {
  console.error(`✗ cannot find expert-library at ${LIB}\n  set EXPERT_LIB_ROOT to the plugin checkout`)
  process.exit(2)
}

const require = createRequire(LIB + '/')
const v2 = require(resolve(LIB, 'lib/v2/index.js'))

const problems = []
const notes = []
const fail = (code, where, msg) => problems.push(`${code} @ ${where} :: ${msg}`)

// ---------------------------------------------------------------- 1. validator
const res = v2.loadPackFromDirSync(dir, { layer: 'domain-pack', label: dir })
for (const d of res.diagnostics) {
  if (d.severity === 'error') fail(d.code, d.path, d.message)
  else notes.push(`warn ${d.code} @ ${d.path} :: ${d.message}`)
}
if (!res.pack) {
  report()
  process.exit(1)
}
const pack = res.pack
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
const manifestPath = resolve(dir, 'source/SOURCE-MANIFEST.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse((await import('node:fs')).readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
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
  // bannedTokens is written at surname/stem granularity ("Grinold" for "Grinold & Kahn"),
  // so treat a manifest value as covered when it and a declared token overlap.
  const declared = [...new Set(
    (pack.qualityPolicies ?? []).flatMap(p => (p.gates ?? []).flatMap(g => g.config?.bannedTokens ?? [])).map(t => String(t).trim())
  )]
  const covered = v => declared.some(t => t.length >= 2 && (t.includes(v) || v.includes(t)))
  const absent = [...expected].filter(v => !covered(v))
  if (absent.length > 0) {
    notes.push(`note ${absent.length}/${expected.size} manifest title/author stem(s) have no overlapping bannedTokens entry (manual list lags the knowledge base): ${absent.slice(0, 6).join(' | ')}${absent.length > 6 ? ' …' : ''}`)
  }
}

// ---------------------------------------------------------------- report
function report() {
  const sections = [
    ['experts', 'teamTemplates', 'outputTemplates', 'qualityPolicies', 'scenarios', 'methodPacks', 'toolProviders', 'knowledgeProviders', 'domainKnowledge', 'skillPackages'],
  ]
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
