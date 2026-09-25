#!/usr/bin/env node
/**
 * 冒烟测试：**真的执行**包内声明过的可执行能力。
 *
 * 为什么要有这个文件：`check-pack` 只能证明"声明的路径存在"（静态），
 * 证明不了"照声明去执行真的能跑通"（动态）。而 transport 一旦指向一个能存在、但跑不起来的命令
 * （缺依赖、参数变了、脚本头部坏了），静态检查全绿、第一次真用才炸。
 *
 * 声明即承诺：transport 里写了 `smokeArgs`，本脚本就照它执行；没写的 transport 只做静态解析核对。
 *
 * 用法：  node scripts/smoke-test.mjs [packDir]
 * 退出码：0 = 全部按声明跑通；1 = 有 transport 跑不通；2 = 不是领域包目录
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join, dirname, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACK = resolve(process.argv[2] ?? resolve(HERE, '..'))
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')

if (!existsSync(join(PACK, 'pack.json'))) {
  console.error(`✗ 不是领域包目录：${PACK}`)
  process.exit(2)
}

const tpDir = resolve(PACK, 'tool-providers')
const transports = []
if (existsSync(tpDir)) {
  for (const f of readdirSync(tpDir).filter(n => n.endsWith('.json'))) {
    let o
    try { o = JSON.parse(readText(resolve(tpDir, f))) } catch (e) { console.error(`✗ ${f} 解析失败：${e.message}`); process.exit(1) }
    for (const t of o.transports ?? []) transports.push({ provider: o.id, file: f, ...t })
  }
}

if (transports.length === 0) { console.log('没有声明任何 transport，无事可做'); process.exit(0) }

let bad = 0, ran = 0
for (const t of transports) {
  const label = `${t.provider}.${t.id}`
  // 静态：命令存在 + 路径型参数可解析
  let cmdOk = true
  try { execFileSync('sh', ['-c', `command -v ${JSON.stringify(t.command)}`], { stdio: 'ignore' }) }
  catch { cmdOk = false }
  const args = (t.args ?? []).map(a => (a.includes('/') && !isAbsolute(a)) ? resolve(PACK, a) : a)
  const missing = args.filter((a, i) => (t.args[i] ?? '').includes('/') && !existsSync(a))

  if (!cmdOk) { console.error(`✗ ${label}：命令不在 PATH：${t.command}`); bad++; continue }
  if (missing.length) { console.error(`✗ ${label}：参数路径不存在：${missing.join(', ')}`); bad++; continue }

  if (!Array.isArray(t.smokeArgs)) {
    console.log(`·  ${label}：静态核对通过（未声明 smokeArgs，未执行）`)
    continue
  }
  try {
    const out = execFileSync(t.command, [...args, ...t.smokeArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: t.timeoutMs ?? 120000 })
    const tail = out.trim().split('\n').slice(-1)[0] ?? ''
    console.log(`✓  ${label}：${t.command} ${t.smokeArgs.join(' ')} → exit 0${tail ? ` ｜ ${tail}` : ''}`)
    ran++
  } catch (e) {
    console.error(`✗ ${label}：${t.command} ${t.smokeArgs.join(' ')} 未跑通（exit=${e.status ?? '?'}）`)
    const err = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-4).join('\n')
    if (err) console.error(err)
    bad++
  }
}

console.log(`\n${bad ? 'FAIL' : 'PASS'}：${transports.length} 个 transport —— 实跑 ${ran} ／ 不通过 ${bad}`)
process.exit(bad ? 1 : 0)
