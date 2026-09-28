#!/usr/bin/env node
/**
 * 版本 bump：一处改版本号，**所有载位**同步，然后自动重钉 digest。
 *
 * 为什么要有这个文件：版本号在 4 类载位上各写一份（pack.json 与 17 个实体/配置文件、
 * SKILL.md 的 frontmatter、README 徽章与版本历史首条、SUBMISSION-CHECKLIST 的 version=），
 * 而 SKILL.md 里也有 version ⇒ 改它就会改 SKILL.md 的 sha256 ⇒ skill-packages 的 digest 必须同批重钉。
 * v2.4.1／2.4.2 两次都是我手工扫的；门禁（check-pack 的 doc-version lockstep + digest
 * reproducibility）会在漏改时拦住你，本脚本负责一次改对。
 *
 * 用法：  node scripts/bump-version.mjs <x.y.z> [packDir] [--dry-run]
 * 行为：  README 版本历史**插入**一条 `- **<新版本>**（<日期>）：（待补发布说明）` 作为新首条；
 *        旧条目一字不动。check-pack 的 release-note-placeholder 会一直 FAIL，直到你补上说明。
 * 退出码：0 = 完成（或 dry-run）；2 = 参数/目录问题
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARGV = process.argv.slice(2)
const DRY = ARGV.includes('--dry-run')
const positional = ARGV.filter(a => !a.startsWith('--'))
const NEW = positional[0]
const PACK = resolve(positional[1] ?? resolve(HERE, '..'))

if (!NEW || !/^\d+\.\d+\.\d+$/.test(NEW)) {
  console.error('用法：node scripts/bump-version.mjs <x.y.z> [packDir] [--dry-run]')
  process.exit(2)
}
if (!existsSync(join(PACK, 'pack.json'))) {
  console.error(`✗ 不是领域包目录：${PACK}`)
  process.exit(2)
}
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
const writeText = (p, s) => { if (!DRY) writeFileSync(p, s) }

const OLD = JSON.parse(readText(join(PACK, 'pack.json'))).version
if (OLD === NEW) { console.log(`版本已是 ${NEW}，无事可做`); process.exit(0) }

const changes = []
const DIMENSIONS = ['experts', 'teamTemplates', 'outputTemplates', 'qualityPolicies',
  'scenarios', 'methodPacks', 'toolProviders', 'knowledgeProviders', 'domainKnowledge', 'skillPackages']
const dirNameOf = k => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

// 1) pack.json + 各维度 JSON 的 version 字段（且必须【恰好等于】当前版本，否则先停）
const files = ['pack.json']
for (const k of DIMENSIONS) {
  const d = join(PACK, dirNameOf(k))
  if (existsSync(d)) for (const f of readdirSync(d).filter(n => n.endsWith('.json'))) files.push(`${dirNameOf(k)}/${f}`)
}
for (const rel of files) {
  const abs = join(PACK, rel)
  const s = readText(abs)
  const pat = `"version": "${OLD}"`
  const n = s.split(pat).length - 1
  if (n === 0) continue
  if (n > 1) { console.error(`✗ ${rel}：${pat} 出现 ${n} 次，不唯一 ⇒ 已停`); process.exit(2) }
  writeText(abs, s.replace(pat, `"version": "${NEW}"`))
  changes.push(`${rel}  version ${OLD} → ${NEW}`)
}

// 2) SKILL.md frontmatter
{
  const rel = 'skills/macro-capital-framework/SKILL.md'
  const abs = join(PACK, rel)
  if (existsSync(abs)) {
    const s = readText(abs)
    const pat = `version: ${OLD}`
    if (s.includes(pat)) { writeText(abs, s.replace(pat, `version: ${NEW}`)); changes.push(`${rel}  frontmatter version ${OLD} → ${NEW}`) }
  }
}

// 3) README：徽章 + 版本历史插入新首条
{
  const rel = 'README.md'
  const abs = join(PACK, rel)
  if (existsSync(abs)) {
    let s = readText(abs)
    if (s.includes(`badge/Version-${OLD}-`)) {
      s = s.replace(`badge/Version-${OLD}-`, `badge/Version-${NEW}-`)
      changes.push(`${rel}  徽章 ${OLD} → ${NEW}`)
    }
    const hIdx = s.search(/^##\s*版本历史\s*$/m)
    if (hIdx >= 0) {
      const date = new Date().toISOString().slice(0, 10)
      const headEnd = s.indexOf('\n', hIdx)
      const insertAt = s.indexOf('\n', headEnd + 1) + 1   // 跳过标题行与其后的空行
      const entry = `\n- **${NEW}**（${date}）：（待补发布说明 —— check-pack 的 release-note-placeholder 会一直 FAIL 到补完）\n`
      s = s.slice(0, insertAt) + entry + s.slice(insertAt)
      changes.push(`${rel}  版本历史插入新首条 ${NEW}（待补发布说明）`)
    } else {
      console.error(`✗ ${rel}：找不到 "## 版本历史" ⇒ 未插入新条目`)
    }
    writeText(abs, s)
  }
}

// 4) SUBMISSION-CHECKLIST 的 version=
{
  const rel = 'SUBMISSION-CHECKLIST.md'
  const abs = join(PACK, rel)
  if (existsSync(abs)) {
    const s = readText(abs)
    const pat = `version=${OLD}`
    if (s.includes(pat)) { writeText(abs, s.replace(pat, `version=${NEW}`)); changes.push(`${rel}  ${pat} → version=${NEW}`) }
  }
}

console.log(changes.length ? changes.map(c => '· ' + c).join('\n') : '（没有需要改的载位？请检查版本号是否写错）')

// 5) 重钉 digest（SKILL.md 变了 ⇒ 其 sha256 变了）
if (!DRY) {
  try {
    const out = execFileSync(process.execPath, [resolve(HERE, 'repin-digests.mjs'), PACK], { encoding: 'utf8' })
    console.log(out.trim())
  } catch (e) {
    console.error('✗ 重钉 digest 失败，请手动检查：\n' + (e.stdout ?? '') + (e.stderr ?? ''))
    process.exit(1)
  }
} else {
  console.log('（dry-run：未写盘、未重钉 digest）')
}
