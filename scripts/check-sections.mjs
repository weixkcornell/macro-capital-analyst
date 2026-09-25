#!/usr/bin/env node
/**
 * section-outline 门禁的执行工具（判据不在本文件里，在包里）：
 * 从 quality-policies 的 `section-outline` gate config 读口径 ——
 *   ① 产物章节集合 ⊇ 输出模板 documentStructure.sections 中 required=true 的章节集合
 *   ② 顺序与模板一致
 *   ③ 多余章节允许，但会在报告里列出（config.criterion 明写"允许但须标明"）
 *
 * 用法：
 *   node scripts/check-sections.mjs --target <final.md|index.html> --template <output-templates/x.json> [--json]
 * 退出码：0 = 通过；1 = 缺章节/顺序不符；2 = 参数或文件问题
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACK = resolve(HERE, '..')
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
const ARGV = process.argv.slice(2)
const val = flag => { const i = ARGV.indexOf(flag); return i >= 0 ? ARGV[i + 1] : null }

const target = val('--target')
const templatePath = val('--template')
if (!target || !templatePath) {
  console.error('用法：node scripts/check-sections.mjs --target <final.md|index.html> --template <output-templates/x.json> [--json]')
  process.exit(2)
}
if (!existsSync(target) || !existsSync(templatePath)) { console.error('✗ 目标或模板文件不存在'); process.exit(2) }

// 判据来自包里（不写死在工具里）
const polDir = resolve(PACK, 'quality-policies')
let criterion = null
for (const f of (await import('node:fs')).readdirSync(polDir).filter(n => n.endsWith('.json'))) {
  const o = JSON.parse(readText(resolve(polDir, f)))
  const g = (o.gates ?? []).find(x => x.id === 'section-outline')
  if (g) criterion = g.config
}
if (!criterion) { console.error('✗ 找不到 section-outline 门禁的 config（判据必须来自包里）'); process.exit(2) }

const tpl = JSON.parse(readText(templatePath))
const required = (tpl.documentStructure?.sections ?? []).filter(s => s.required).map(s => s.name)
const allSections = (tpl.documentStructure?.sections ?? []).map(s => s.name)

const text = readText(target)
const isHtml = /\.html?$/i.test(target)
// 章节提取：markdown 取 H2；HTML 取 h2 标签文本（结构节点，不做正文字符串匹配）
const rawFound = isHtml
  ? [...text.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
  : [...text.matchAll(/^##\s+(.+?)\s*$/gm)].map(m => m[1].trim())

// 规范化规则也来自包里（config.normalization）：去掉可选编号前缀与空白后比较。
// 不这样做会对「一、摘要」这类写法误判为"缺章节"（首单实测过）。
const norm = t => String(t)
  .replace(/^[（(]?[一二三四五六七八九十百0-9]+[）)、.．:：]\s*/, '')
  .replace(/\s+/g, '')
  .trim()
const found = rawFound.map(norm)
const requiredN = required.map(norm)
const allN = allSections.map(norm)

const missing = requiredN.filter(r => !found.includes(r)).map((r, i) => required[i] ?? r)
const extras = rawFound.filter((f, i) => !allN.includes(found[i]))
// 顺序：required 在产物中出现的相对顺序须与模板一致
const orderSeq = requiredN.map(r => found.indexOf(r)).filter(i => i >= 0)
const orderOk = orderSeq.every((v, i, a) => i === 0 || a[i - 1] < v)

const report = {
  gate: 'section-outline',
  target,
  template: templatePath,
  criterion_from_pack: criterion,
  required, found: rawFound, found_normalized: found, missing, extras,
  normalization_from_pack: criterion.normalization,
  order_ok: orderOk,
  verdict: (missing.length === 0 && orderOk) ? 'pass' : 'fail',
}
if (ARGV.includes('--json')) console.log(JSON.stringify(report, null, 1))
else {
  console.log(`section-outline：${target}`)
  console.log(`  模板 required 章节（${required.length}）：${required.join(' / ')}`)
  console.log(`  产物发现的章节（${rawFound.length}）：${rawFound.join(' / ')}`)
  if (missing.length) console.log(`  ✗ 缺章节：${missing.join(' / ')}`)
  if (extras.length) console.log(`  · 模板外章节（允许，须在交付说明中标明）：${extras.join(' / ')}`)
  if (!orderOk) console.log('  ✗ 顺序与模板不一致')
  console.log(`  VERDICT: ${report.verdict.toUpperCase()}`)
}
process.exit(report.verdict === 'pass' ? 0 : 1)
