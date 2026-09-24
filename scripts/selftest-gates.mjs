#!/usr/bin/env node
/**
 * 门禁自校准（双向对照）：`check-pack.mjs` 的负向样本套件。
 *
 * 为什么要有这个文件：改好一处缺陷之后，「这道门禁下次还能不能抓住它」必须**可复跑**。
 * v2.4.1 的两道新门禁是在临时目录里手工注入缺陷验的 —— 手工验证不可复跑、也不随代码留存，
 * 属于「当时为真、事后不可复核」。本脚本把它固化成一次命令。
 *
 * 做法：把整个包复制到临时目录 → 逐个注入一个已知缺陷 → 运行 `check-pack.mjs` →
 * 断言它报出**预期 code** 且退出码非零；基线（不注入）必须 0 problem。
 *
 * 用法：  node scripts/selftest-gates.mjs [packDir]
 * 退出码：0 = 全部按预期；1 = 有门禁未抓住 / 行为不符预期；2 = 环境不可用
 */
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACK = resolve(process.argv[2] ?? resolve(HERE, '..'))
const CHECK = resolve(HERE, 'check-pack.mjs')

if (!existsSync(resolve(PACK, 'pack.json'))) {
  console.error(`✗ 不是领域包目录：${PACK}`)
  process.exit(2)
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8')
const write = (root, rel, s) => writeFileSync(join(root, rel), s)

/** 替换必须命中且只命中一次 —— 否则"注入失败"会被误读成"门禁没抓住"。 */
function replaceOnce(root, rel, re, to) {
  const s = read(root, rel)
  const m = s.match(re)
  if (!m) throw new Error(`注入失败：${rel} 中找不到 ${re}`)
  if (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')).length !== 1) {
    throw new Error(`注入目标不唯一：${rel} 中 ${re} 命中多处`)
  }
  write(root, rel, s.replace(re, to))
}

const firstJson = (root, dirName, pred) => {
  const d = join(root, dirName)
  for (const f of readdirSync(d).filter(n => n.endsWith('.json'))) {
    const o = JSON.parse(read(root, `${dirName}/${f}`))
    if (pred(o)) return `${dirName}/${f}`
  }
  throw new Error(`未找到目标实体于 ${dirName}`)
}

// 每个样本：注入一处已知缺陷，期望 check-pack 报出该 code。
const CASES = [
  { name: '基线（不注入）', expectCode: null, mutate: () => {} },
  {
    name: 'README 徽章与 pack.json 不同版本',
    expectCode: 'doc-version-drift',
    mutate: r => replaceOnce(r, 'README.md', /badge\/Version-[^-\s]+-/, 'badge/Version-9.9.9-'),
  },
  {
    name: 'README 版本历史首条落后',
    expectCode: 'doc-version-drift',
    mutate: r => {
      const s = read(r, 'README.md')
      const i = s.search(/^##\s*版本历史\s*$/m)
      const head = s.slice(i).match(/^- \*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/m)
      if (!head) throw new Error('注入失败：README 版本历史里找不到 "- **X.Y.Z**" 首条')
      write(r, 'README.md', s.slice(0, i) + s.slice(i).replace(head[0], '- **9.9.9**'))
    },
  },
  {
    name: 'SUBMISSION-CHECKLIST 版本落后',
    expectCode: 'doc-version-drift',
    mutate: r => replaceOnce(r, 'SUBMISSION-CHECKLIST.md', /version=[0-9]+\.[0-9]+\.[0-9]+/, 'version=9.9.9'),
  },
  {
    name: '实体 version 与 pack.json 不一致',
    expectCode: 'version-drift',
    mutate: r => {
      const f = firstJson(r, 'method-packs', () => true)
      replaceOnce(r, f, /"version": "[0-9]+\.[0-9]+\.[0-9]+"/, '"version": "9.9.9"')
    },
  },
  {
    name: 'digest 与 digestTarget 内容不符',
    expectCode: 'digest-mismatch',
    mutate: r => {
      const f = firstJson(r, 'domain-knowledge', o => o?.snapshot?.digest)
      replaceOnce(r, f, /"digest": "[0-9a-f]{64}"/, '"digest": "deadbeef' + '0'.repeat(56) + '"')
    },
  },
  {
    name: '声明了 digest 但没有 digestTarget',
    expectCode: 'digest-without-target',
    mutate: r => {
      const f = firstJson(r, 'skill-packages', o => o?.source?.digest)
      replaceOnce(r, f, /,\s*"digestTarget": "[^"]*"/, '')
    },
  },
]

let bad = 0
for (const c of CASES) {
  const tmp = mkdtempSync(join(tmpdir(), 'pack-selftest-'))
  let out = '', code = 0
  try {
    cpSync(PACK, tmp, { recursive: true, filter: s => !/[/\\](\.git|engine|__pycache__)$/.test(s) })
    c.mutate(tmp)
    try {
      out = execFileSync('node', [CHECK, tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`
      code = typeof e.status === 'number' ? e.status : 1
    }
    const ok = c.expectCode === null
      ? (code === 0 && /0 problems/.test(out))
      : (code !== 0 && out.includes(c.expectCode))
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name} → 期望 ${c.expectCode ?? '无问题(exit 0)'}，实得 exit=${code}${c.expectCode && !out.includes(c.expectCode) ? '（未报出该 code）' : ''}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${CASES.length - bad}/${CASES.length} 门禁对照样本按预期`)
process.exit(bad === 0 ? 0 : 1)
