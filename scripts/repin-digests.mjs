#!/usr/bin/env node
/**
 * 重钉 digest：凡声明了 digest 的实体，按 digestTarget 当场重算并写回。
 *
 * 为什么要有这个文件：`sha256(SKILL.md)` 是 digest 目标，而 SKILL.md 的 frontmatter 里
 * 也有 version —— **改版本号就会改它自己的 sha256**，因此每次版本 bump 都必须同批重钉。
 * v2.4.1／2.4.2 两次都是我手动改的；手工步骤不可复跑，这个脚本把它变成一条命令。
 * 门禁（check-pack 的 digest reproducibility）负责在忘记时拦住你；本脚本负责一键修好。
 *
 * 用法：  node scripts/repin-digests.mjs [packDir] [--dry-run]
 * 退出码：0 = 已全部一致（或已写回）；1 = 有声明缺 digestTarget／目标不存在；2 = 不是领域包目录
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARGV = process.argv.slice(2)
const DRY = ARGV.includes('--dry-run')
const PACK = resolve(ARGV.find(a => !a.startsWith('--')) ?? resolve(HERE, '..'))
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')

if (!existsSync(join(PACK, 'pack.json'))) {
  console.error(`✗ 不是领域包目录：${PACK}`)
  process.exit(2)
}

/** 收集所有 (文件, 声明 digest, digestTarget, 算法) —— 只认这两种已入册的载位。 */
const targets = []
const collect = (dim, pred, pick) => {
  const d = resolve(PACK, dim)
  if (!existsSync(d)) return
  for (const f of readdirSync(d).filter(n => n.endsWith('.json')).sort()) {
    const rel = `${dim}/${f}`
    let obj
    try { obj = JSON.parse(readText(resolve(PACK, rel))) } catch { continue }
    if (!pred(obj)) continue
    targets.push({ rel, ...pick(obj) })
  }
}
collect('skill-packages', o => o?.source?.digest, o => o.source)
collect('domain-knowledge', o => o?.snapshot?.digest, o => o.snapshot)

if (targets.length === 0) {
  console.log('没有声明 digest 的实体，无事可做')
  process.exit(0)
}

let bad = 0, changed = 0, same = 0
for (const t of targets) {
  if (!t.digestTarget) {
    console.error(`✗ ${t.rel}：声明了 digest 但没有 digestTarget ⇒ 不可复算（先补 digestTarget）`)
    bad++
    continue
  }
  const abs = resolve(PACK, t.digestTarget)
  if (!existsSync(abs)) {
    console.error(`✗ ${t.rel}：digestTarget "${t.digestTarget}" 不存在`)
    bad++
    continue
  }
  const algo = t.digestAlgorithm ?? 'sha256'
  let got
  try { got = createHash(algo).update(readFileSync(abs)).digest('hex') }
  catch (e) { console.error(`✗ ${t.rel}：digestAlgorithm "${algo}" 不可用：${e.message}`); bad++; continue }

  if (got === t.digest) { same++; continue }
  if (DRY) { console.log(`… ${t.rel}：${String(t.digest).slice(0, 12)}… -> ${got.slice(0, 12)}…（dry-run，未写）`); changed++; continue }
  // 只做定点替换，避免重排 JSON（保 diff 最小、保注释性字段不动）
  const src = readText(resolve(PACK, t.rel))
  if (!src.includes(t.digest)) { console.error(`✗ ${t.rel}：文件里找不到待替换的 digest 串`); bad++; continue }
  writeFileSync(resolve(PACK, t.rel), src.replace(t.digest, got))
  console.log(`✓ ${t.rel}：${String(t.digest).slice(0, 12)}… -> ${got.slice(0, 12)}…（target=${t.digestTarget}, algo=${algo}）`)
  changed++
}

console.log(`\n${bad ? 'FAIL' : 'PASS'}：${targets.length} 个 digest —— 一致 ${same} ／ ${DRY ? '待更新' : '已更新'} ${changed} ／ 不可复算 ${bad}`)
process.exit(bad ? 1 : 0)
