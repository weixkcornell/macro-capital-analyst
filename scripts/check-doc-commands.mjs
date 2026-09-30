#!/usr/bin/env node
/**
 * 文档-契约一致性门（离线，deterministic）。
 *
 * 为什么要有它（真实事故）：v2.8.1 把 `indicator_code` 当成了 `query_economic_indicator_data`
 * 的入参写进 data-contracts / tool-providers / quality-policies 的调用示例，而真实 inputSchema
 * 只收 `question`（+可选日期等）⇒ **文档里的命令照抄跑不通**（PARAM_VALIDATION_ERROR）。
 * 这类缺陷 check-pack / selftest-gates / i1 都抓不到——它们不读文档里的 CLI 示例。
 *
 * 判据来源：`data-contracts/wind-tool-schemas.json`（从后端官方 `list-tools` 记录的真实 inputSchema）。
 * 本工具**不联网**：它只做「文档里出现的字段名 ⊆ 记录的 schema 字段集」的一致性检查。
 * 字段真相变化时须重抓该文件（工具会在报告里给出重抓命令）。
 *
 * 覆盖范围：包内 *.md / *.json / *.csv 中形如
 *   cli.mjs call <server_type> <tool_name> '<params_json>'
 * 的调用示例（JSON 文件里的 `\"` 会先反转义再解析）。
 *
 * 用法：
 *   node scripts/check-doc-commands.mjs [--dir .] [--schema data-contracts/wind-tool-schemas.json] [--json]
 * 退出码：0 = 全部示例的字段都在 schema 内；1 = 有未知字段/无法解析；2 = 参数或判据文件缺失。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ARGV = process.argv.slice(2)
const val = (f, d) => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : d }
const DIR = val('--dir', '.')
const SCHEMA = val('--schema', join(DIR, 'data-contracts/wind-tool-schemas.json'))
const AS_JSON = ARGV.includes('--json')

if (!existsSync(SCHEMA)) {
  console.error(`✗ 缺判据文件 ${SCHEMA}（应从 list-tools 记录真实 inputSchema）`)
  process.exit(2)
}
const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'))
const servers = schema.serverTypes ?? {}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'engine', '__pycache__', 'dist', 'build'])
const EXT = /\.(md|json|csv|txt|mjs|sh|py)$/
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out) }
    else if (EXT.test(e.name)) out.push(join(dir, e.name))
  }
  return out
}

// cli.mjs call <server> <tool> '<params>'  —— 兼容 JSON 内被转义的 \" 形式
const CALL = /cli\.mjs['"\s]+call\s+([A-Za-z_][\w]*)\s+([A-Za-z_][\w]*)\s+(['"])([\s\S]*?)\3/g

const problems = []
const checked = []
for (const file of walk(DIR)) {
  let text
  try { text = readFileSync(file, 'utf8') } catch { continue }
  const raw = text.replace(/\\"/g, '"')            // JSON 文件里的转义引号先还原
  for (const m of raw.matchAll(CALL)) {
    const [, server, tool, , paramsRaw] = m
    const rel = relative(DIR, file)
    let params
    try { params = JSON.parse(paramsRaw) } catch { problems.push({ file: rel, tool, issue: 'PARAMS_UNPARSEABLE', detail: paramsRaw.slice(0, 60) }); continue }
    const spec = servers[server]?.[tool]
    if (!spec) { problems.push({ file: rel, tool: `${server}.${tool}`, issue: 'TOOL_NOT_RECORDED', detail: 'schema 文件未记录该工具，须重抓 list-tools' }); continue }
    const allowed = new Set(spec.properties)
    const unknown = Object.keys(params).filter(k => !allowed.has(k))
    const missing = (spec.required ?? []).filter(k => !(k in params))
    checked.push({ file: rel, tool: `${server}.${tool}`, keys: Object.keys(params), unknown, missing })
    if (unknown.length) problems.push({ file: rel, tool: `${server}.${tool}`, issue: 'UNKNOWN_FIELD', detail: `文档用了 schema 里不存在的字段：${unknown.join(', ')}（允许：${[...allowed].join(', ')}）` })
    if (missing.length) problems.push({ file: rel, tool: `${server}.${tool}`, issue: 'MISSING_REQUIRED', detail: `缺必填字段：${missing.join(', ')}` })
  }
}

// ② 能力契约（CSV 的 input_schema）——这是**权威声明**，2.8.1 的缺陷正出在这里
const capMap = schema.capabilityMap ?? {}
const csvFiles = walk(DIR).filter(f => f.endsWith('.csv'))
for (const file of csvFiles) {
  const rel = relative(DIR, file)
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) continue
  const head = lines[0].split(',').map(s => s.trim())
  const iCap = head.indexOf('capability'), iIn = head.indexOf('input_schema')
  if (iCap < 0 || iIn < 0) continue
  for (const line of lines.slice(1)) {
    // CSV 单元格内含逗号，故直接抓 capability 与第一个 {...} JSON 块
    const cap = line.slice(0, line.indexOf(',')).trim()
    const tool = capMap[cap]
    if (!tool) continue
    const [server, name] = tool.split('.')
    const spec = servers[server]?.[name]
    if (!spec) { problems.push({ file: rel, tool, issue: 'TOOL_NOT_RECORDED', detail: 'schema 未记录该工具' }); continue }
    const m = line.match(/\{(?:[^{}]|\{[^{}]*\})*\}/)
    if (!m) continue
    let obj
    try { obj = JSON.parse(m[0].replace(/""/g, '"')) } catch { obj = null }
    if (!obj) continue
    const allowed = new Set(spec.properties)
    const unknown = Object.keys(obj).filter(k => !allowed.has(k))
    const missing = (spec.required ?? []).filter(k => !(k in obj))
    checked.push({ file: rel, tool, keys: Object.keys(obj), unknown, missing, via: 'input_schema' })
    if (unknown.length) problems.push({ file: rel, tool, issue: 'UNKNOWN_FIELD', detail: `input_schema 声明了真实 schema 不存在的字段：${unknown.join(', ')}（允许：${[...allowed].join(', ')}）` })
    if (missing.length) problems.push({ file: rel, tool, issue: 'MISSING_REQUIRED', detail: `input_schema 缺必填字段：${missing.join(', ')}` })
  }
}

const report = { gate: 'doc-command-consistency', schema: SCHEMA, recordedAt: schema.recordedAt, checked, problems,
  verdict: problems.length ? 'fail' : 'pass',
  reRecordHint: '字段真相变化时重抓：cd <wind-mcp-skill> && HOME=<凭据用户家目录> node scripts/cli.mjs list-tools economic_data' }

if (AS_JSON) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`文档-契约一致性：扫描到 ${checked.length} 处 CLI 调用示例（判据 ${relative(DIR, SCHEMA)}，recordedAt ${schema.recordedAt ?? '?'}）`)
  for (const c of checked) console.log(`  · ${c.file}｜${c.tool}｜字段 ${c.keys.join(', ')}${c.unknown.length ? ' ← 未知字段!' : ''}`)
  if (problems.length) {
    console.log('\n✗ 文档里的命令与真实 schema 不一致：')
    for (const p of problems) console.log(`   - [${p.issue}] ${p.file}｜${p.tool}：${p.detail}`)
    console.log(`\n${report.reRecordHint}`)
  } else {
    console.log('\nVERDICT: PASS —— 文档示例的字段全部落在真实 inputSchema 内')
  }
}
process.exit(problems.length ? 1 : 0)
