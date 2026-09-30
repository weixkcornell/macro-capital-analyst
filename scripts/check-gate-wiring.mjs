#!/usr/bin/env node
/**
 * 门禁接线检查（v2.8.12 新增）：**声明的判据必须真的被消费**。
 *
 * 为什么需要：本包在 2026-09-30 一天内连续踩到三例同源缺陷 ——
 *   ① `audit-mobile.py` 的策略加载器只判 `is_file()`、而调用方传的是目录 ⇒ 声明判据从未加载；
 *   ② `check-wind-provenance.py` 读到了 `cfg` 却从未传入检查函数 ⇒ 判据全是内置的；
 *   ③ 同一脚本的 `bodyFontMinPx` 建整数键、按字符串键查询 ⇒ 声明值静默丢失。
 * 三例的共同形态是：**「声明被加载」≠「声明生效」**，而门禁照样报 PASS。
 * 事后我们靠「偏离默认必须改变判定」的自校准抓住它们 —— 那是**事后**手段；
 * 本检查是**事前**手段：把「哪个门由哪个执行器消费哪些判据键」写成可机检的接线登记表。
 *
 * 判据来自包（`quality-policies/*.json` 各门的 `config.wiring`）：
 *   wiring.executor      —— 执行器路径（相对包根）
 *   wiring.consumesKeys  —— 该执行器**实际消费**的 config 键名
 *   wiring.selfTest      —— 该门的自校准命令（脚本名须在 release-check.sh 里被调用）
 *   wiring.builtin       —— 显式声明「本门判据不来自 config」（如仅为本仓约定）
 *
 * 检查项：
 *   1. 有 `config` 的门必须声明 `wiring`（或显式 `wiring.builtin=true`）—— 否则「判据来自包里」这句话无法核验
 *   2. `wiring.executor` 文件必须存在
 *   3. `consumesKeys` 里每个键名必须**在执行器源码里逐字出现**（grep 级确定性证据，不做事后运行时判断）
 *   4. `consumesKeys` 必须覆盖该门 config 中除元信息键（wiring/selftest/why/notes/evidenceFromTrialRun/executable/switchNote）以外的键
 *   5. 声明了 `selfTest` 的门，其脚本必须真的被 `scripts/release-check.sh` 调用（否则自校准不参与发布）
 *
 * 用法：
 *   node scripts/check-gate-wiring.mjs [--pack <dir>] [--json]
 *   node scripts/check-gate-wiring.mjs --selftest        # 1 正向 + 4 负向对照
 * 退出码：0 通过；1 有未接线/未消费；2 参数或文件问题
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARGV = process.argv.slice(2)
const val = f => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : null }
const PACK = resolve(val('--pack') ?? resolve(HERE, '..'))

/** 元信息键：不参与「是否被消费」的核对（它们是给人读的说明或本检查自身的登记） */
const META_KEYS = new Set(['wiring', 'selftest', 'why', 'notes', 'note', 'evidenceFromTrialRun',
  'executable', 'switchNote', 'rationale', 'severityNote', 'criterion', 'source'])

function loadGates(pack) {
  const dir = join(pack, 'quality-policies')
  const out = []
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    for (const g of doc.gates ?? []) out.push({ ...g, __file: f })
  }
  return out
}

function check(pack) {
  const problems = []
  const info = []
  const gates = loadGates(pack)
  const rcPath = join(pack, 'scripts', 'release-check.sh')
  const rc = existsSync(rcPath) ? readFileSync(rcPath, 'utf8') : ''
  for (const g of gates) {
    const cfg = g.config ?? {}
    const keys = Object.keys(cfg)
    if (keys.length === 0) { info.push({ gate: g.id, wiring: 'no-config' }); continue }
    const w = cfg.wiring
    if (!w) {
      const soft = g.severity === 'soft'
      problems.push({ code: 'gate-wiring-missing', gate: g.id, msg: `${g.id}：有 config 但未声明 config.wiring ⇒「判据来自包里」不可核验${soft ? '（soft 门，仍应登记）' : ''}` })
      continue
    }
    if (w.builtin === true) {
      if (!w.reason) problems.push({ code: 'gate-wiring-incomplete', gate: g.id, msg: `${g.id}：builtin=true 必须给 reason（说明判据为何不在 config 里）` })
      info.push({ gate: g.id, wiring: 'builtin', reason: w.reason ?? '' }); continue
    }
    if (w.semantic === true) {
      if (!w.reason) problems.push({ code: 'gate-wiring-incomplete', gate: g.id, msg: `${g.id}：semantic=true 必须给 reason（说明由谁、按什么判）` })
      info.push({ gate: g.id, wiring: 'semantic', reason: w.reason ?? '' }); continue
    }
    if (!w.executor) { problems.push({ code: 'gate-wiring-incomplete', gate: g.id, msg: `${g.id}：wiring 缺 executor` }); continue }
    const ex = join(pack, w.executor)
    if (!existsSync(ex)) { problems.push({ code: 'gate-wiring-executor-missing', gate: g.id, msg: `${g.id}：执行器不存在 ${w.executor}` }); continue }
    const src = readFileSync(ex, 'utf8')
    const selfName = 'check-gate-wiring.mjs'
    const isSelf = w.executor.includes(selfName)
    const consumed = Array.isArray(w.consumesKeys) ? w.consumesKeys : []
    if (consumed.length === 0) problems.push({ code: 'gate-wiring-incomplete', gate: g.id, msg: `${g.id}：wiring.consumesKeys 为空（若无 config 判据请显式 builtin=true 或 semantic=true）` })
    // 严格匹配：把键名当作**独立标识符**找（前后不得紧邻字母/数字/下划线），
    // 否则 `checks` 会被 `run_checks` 之类误判为「已被消费」——那正是本检查要防的假绿灯。
    const referenced = k => new RegExp(`(^|[^A-Za-z0-9_])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(src)
    if (isSelf) problems.push({ code: 'gate-wiring-self-reference', gate: g.id, msg: `${g.id}：执行器不能指向本检查自身（会产生自我满足的假绿灯）` })
    for (const k of consumed) {
      if (!referenced(k)) problems.push({ code: 'gate-key-unconsumed', gate: g.id, msg: `${g.id}：声明消费 ${k}，但 ${w.executor} 源码里找不到该键名（按独立标识符匹配）⇒ 疑似「声明未生效」` })
    }
    const missing = keys.filter(k => !META_KEYS.has(k) && !consumed.includes(k) && !(w.notConsumed ?? []).includes(k))
    if (missing.length) problems.push({ code: 'gate-key-undeclared-unconsumed', gate: g.id, msg: `${g.id}：config 有键未登记消费也未声明豁免：${missing.join('、')}（如确为说明文字请加进 wiring.notConsumed）` })
    if (w.selfTest) {
      const script = String(w.selfTest).match(/[\w./-]+\.(mjs|py|sh)/)?.[0]?.split('/').pop()
      if (script && !rc.includes(script)) problems.push({ code: 'gate-selftest-unwired', gate: g.id, msg: `${g.id}：声明了自校准（${w.selfTest}），但 release-check.sh 未调用 ${script}` })
    }
    info.push({ gate: g.id, wiring: 'policy', executor: w.executor, consumes: consumed.length, selfTest: w.selfTest ?? null })
  }
  return { problems, info, gateCount: gates.length }
}

if (ARGV.includes('--selftest')) process.exit(runSelftest())
if (val('--pack') && !existsSync(PACK)) { console.error(`✗ 找不到包目录 ${PACK}`); process.exit(2) }
const res = check(PACK)
if (ARGV.includes('--json')) console.log(JSON.stringify(res, null, 1))
else {
  console.log(`gate-wiring：${PACK}（${res.gateCount} 门）`)
  for (const i of res.info) console.log(`  · ${i.gate}: ${i.wiring}${i.executor ? ` → ${i.executor}（消费 ${i.consumes} 键${i.selfTest ? '，含自校准' : ''}）` : ''}`)
  for (const p of res.problems) console.log(`  ✗ [${p.code}] ${p.msg}`)
  console.log(`  VERDICT: ${res.problems.length ? 'FAIL' : 'PASS'}`)
}
process.exit(res.problems.length ? 1 : 0)

/* ── 自校准：1 正向 + 4 负向（否则接线检查自己也是纸门） ── */
function runSelftest() {
  const root = mkdtempSync(join(tmpdir(), 'gate-wiring-'))
  const tmp = join(root, 'pack')
  cpSync(PACK, tmp, { recursive: true, filter: s => !s.includes('/.git') && !s.includes('__pycache__') })
  const pol = join(tmp, 'quality-policies', 'baseline.json')
  const cases = []
  const mutate = (fn, name) => {
    const doc = JSON.parse(readFileSync(pol, 'utf8'))
    fn(doc)
    writeFileSync(pol, JSON.stringify(doc, null, 2))
    const r = check(tmp)
    cases.push([name, r.problems.length > 0, r.problems.map(p => p.code)])
  }
  // 正向：真实包应通过（注意：副本已含 .keep 之外的原文件）
  const ok = check(tmp)
  cases.push(['正向：现盘包接线完整', ok.problems.length === 0, ok.problems.map(p => p.code)])
  const orig = readFileSync(pol, 'utf8')
  // 负向 1：删掉某门的 wiring
  mutate(d => { const g = d.gates.find(x => x.id === 'mobile-readability'); delete g.config.wiring }, '负向：删掉 wiring ⇒ gate-wiring-missing')
  // 负向 2：consumesKeys 里塞一个执行器源码中不存在的键名
  writeFileSync(pol, orig)
  mutate(d => { d.gates.find(x => x.id === 'wind-provenance').config.wiring.consumesKeys.push('__not_in_source__') }, '负向：登记了不存在的键 ⇒ gate-key-unconsumed')
  // 负向 3：executor 指向不存在的文件
  writeFileSync(pol, orig)
  mutate(d => { d.gates.find(x => x.id === 'template-conformance').config.wiring.executor = 'scripts/nope.mjs' }, '负向：执行器不存在 ⇒ gate-wiring-executor-missing')
  // 负向 4：声明自校准但 release-check 未调用
  writeFileSync(pol, orig)
  mutate(d => { d.gates.find(x => x.id === 'mobile-readability').config.wiring.selfTest = 'python3 scripts/never-wired-selftest.py --selftest' }, '负向：声明了自校准但 release-check 未调用 ⇒ gate-selftest-unwired')
  const judged = cases.map(([n, hit, codes]) => [n, hit])
  for (const [n, hit] of judged) console.log(`  ${hit ? '✓' : '✗'} ${n}`)
  const bad = judged.filter(([, hit]) => !hit)
  console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'}: ${judged.length - bad.length}/${judged.length} 接线对照样本按预期（隔离目录 ${root}）`)
  rmSync(root, { recursive: true, force: true })
  return bad.length === 0 ? 0 : 1
}
