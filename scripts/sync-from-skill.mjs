#!/usr/bin/env node
/**
 * sync-from-skill —— 技能（源头）→ 下游载体的漂移报告器。
 *
 * 背景（v41 审查发现）：领域包的「同步技能 vN」是人工重写而非复制，
 * 已实际漏搬 2 条闸门判据（v2.9.0 声称同步 v40，tri-gates 实为 8/6/4）。
 * 本脚本把「同步」变成可机检的比对：
 *   ① 技能版本 ↔ VERSIONS.json.carriers.skill.version
 *   ② 技能 §4 闸门判据条数 ↔ method-packs/tri-gates.json 实际 rules 数
 *   ③ 技能账本源数 ↔ source/SOURCE-MANIFEST.json materials 数
 *   ④ （--plugin-dir）插件包内 SKILL.md 逐字节指纹 ↔ 技能本体
 *
 * 用法：node scripts/sync-from-skill.mjs [--skill-dir <路径>] [--plugin-dir <路径>]
 * 本地技能不可得（CI）→ 打 skip note、exit 0；可得且有漂移 → exit 1。
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const argv = process.argv.slice(2)
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }

const DEFAULT_SKILL = process.env.MACRO_SKILL_DIR ?? 'C:/Users/AI-PC10203/.workbuddy/skills/macro-capital-market-analysis'
const SKILL = resolve(argOf('--skill-dir') ?? DEFAULT_SKILL)
const PLUGIN = argOf('--plugin-dir') ? resolve(argOf('--plugin-dir')) : null

let failed = 0
const ok = m => console.log('ok   ' + m)
const bad = m => { failed++; console.log('FAIL ' + m) }

if (!existsSync(SKILL) || !existsSync(join(SKILL, 'SKILL.md'))) {
  console.log('skip 本地技能不可得（' + SKILL + '）——CI 场景正常；本地使用请设 MACRO_SKILL_DIR')
  process.exit(0)
}
console.log('技能目录：' + SKILL)

// ① 技能版本 ↔ 映射表
const sk = readFileSync(join(SKILL, 'SKILL.md'), 'utf8')
const skillVer = Number((sk.match(/^version:\s*(\d+)/m) ?? [])[1])
const vm = JSON.parse(readFileSync(join(ROOT, 'VERSIONS.json'), 'utf8'))
if (skillVer !== vm.carriers.skill.version) bad(`VERSIONS.json 技能版本(${vm.carriers.skill.version}) ≠ 技能实际(${skillVer})——先更新 VERSIONS.json`)
else ok(`技能版本一致：v${skillVer}`)

// ② 闸门判据条数
const sec = (re) => { const m = sk.match(re); return m ? m[0] : '' }
const s41 = sec(/\r?\n### 4\.1[\s\S]*?\r?\n### 4\.2/)
const s42 = sec(/\r?\n### 4\.2[\s\S]*?\r?\n### 4\.3/)
const countRules = (txt) => (txt.match(/^\d+\. \*\*/gm) ?? []).length
const nA = countRules(s41), nB = countRules(s42)
const tri = JSON.parse(readFileSync(join(ROOT, 'method-packs/tri-gates.json'), 'utf8'))
const triA = tri.gates.find(g => g.id === 'gate-a').rules.length
const triB = tri.gates.find(g => g.id === 'gate-b').rules.length
if (nA !== triA) bad(`闸门 A 判据：技能 ${nA} 条 ↔ tri-gates ${triA} 条——漏搬或未同步`)
else ok(`闸门 A 判据条数一致：${nA}`)
if (nB !== triB) bad(`闸门 B 判据：技能 ${nB} 条 ↔ tri-gates ${triB} 条——漏搬或未同步`)
else ok(`闸门 B 判据条数一致：${nB}`)
if (!(vm.gateCounts.gateA === triA && vm.gateCounts.gateB === triB)) bad('VERSIONS.json.gateCounts 与 tri-gates 不一致')
else ok('VERSIONS.json.gateCounts 一致')

// ③ 源数
const ledger = JSON.parse(readFileSync(join(SKILL, 'knowledge-ledger.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(ROOT, 'source/SOURCE-MANIFEST.json'), 'utf8'))
const nSrc = (ledger.sources ?? []).length
const nMat = (manifest.materials ?? []).length
if (nSrc !== nMat) bad(`源数漂移：技能账本 ${nSrc} ↔ 领域包清单 ${nMat}`)
else ok(`源数一致：${nSrc}`)
if (vm.sourceCounts.total !== nSrc) bad(`VERSIONS.json.sourceCounts.total(${vm.sourceCounts.total}) ≠ ${nSrc}`)
else ok('VERSIONS.json.sourceCounts 一致')

// ④ 插件包逐字节指纹
if (PLUGIN) {
  const pSk = join(PLUGIN, 'skills/macro-capital-market-analysis/SKILL.md')
  if (!existsSync(pSk)) bad('插件包内找不到 SKILL.md：' + pSk)
  else {
    const h = b => createHash('sha256').update(b).digest('hex')
    const a = h(readFileSync(join(SKILL, 'SKILL.md'))), b = h(readFileSync(pSk))
    if (a !== b) bad(`插件包 SKILL.md 指纹漂移：插件 ${b.slice(0, 12)} ≠ 技能 ${a.slice(0, 12)}——重打包`)
    else ok('插件包 SKILL.md 逐字节一致：' + a.slice(0, 12))
    const pj = JSON.parse(readFileSync(join(PLUGIN, '.codebuddy-plugin/plugin.json'), 'utf8'))
    if (Number(pj.skillVersion) !== skillVer) bad(`插件包 skillVersion(${pj.skillVersion}) ≠ 技能(${skillVer})`)
    else ok('插件包 skillVersion 一致')
  }
}

console.log('')
if (failed) { console.log(`FAIL: ${failed} 项漂移——先更新 VERSIONS.json / 搬运判据 / 重打插件包，再发布`); process.exit(1) }
console.log('PASS: 技能 → 下游载体无漂移')
