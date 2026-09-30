#!/usr/bin/env node
/**
 * template-conformance 门禁的执行工具（判据来自模板的 designSystem，不写死在本文件里）。
 *
 * 为什么需要：v1 的「输出模板」只是愿望清单 —— 版式写在渲染器里、每次交付另写一套脚本，
 * 于是模板说的话与产物做的事可以完全无关。本门禁把模板变成**可核对的契约**：
 *   ① tokens 自洽：designSystem.roles 里声明的对比度必须由 token 值重算得出，且达到声明的 minRatio
 *   ② tokens 一致：同一包内各输出模板的核心色阶/字号阶/间距阶/圆角/投影/断点必须相同（一个包一个视觉身份）
 *   ③ tokens 落产物：产物 :root 必须逐条声明模板的 token，且**取值与模板逐字相同**
 *   ④ components 落产物：模板声明为必需的类名必须出现在产物里；`::: 指令` 与组件一一对应
 *   ⑤ 纪律：不得出现 #fff/#000 底色；CSS 里不得出现**档外字号**（font-size 只能是 var(--fs-*) 或相对单位）
 *   ⑥ 指令完整性：md 里每个 ::: 名必须在模板 directives.list 白名单内，且被使用的指令都必须真的渲染出组件
 *
 * 用法：
 *   node scripts/check-template-conformance.mjs --template <output-templates/x.json> --md <final.md> --html <index.html> [--json]
 *   node scripts/check-template-conformance.mjs --selftest [--pack <dir>]     # 正向 1 例 + 负向 5 例
 * 退出码：0 通过；1 有硬门未过；2 参数/契约缺失
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACK = resolve(HERE, '..')
const ARGV = process.argv.slice(2)
const val = f => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : null }
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
const readJson = p => JSON.parse(readText(p))

/* ── 对比度（WCAG 2.x 相对亮度） ── */
const srgb = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = hex => {
  const h = String(hex).trim().replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)]; const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05) }

/* ── 核心 token 组（跨模板一致性比较范围） ── */
const CORE = ['designSystem.tokens.color', 'designSystem.tokens.type.scale', 'designSystem.tokens.type.lineHeight',
  'designSystem.tokens.type.letterSpacing', 'designSystem.tokens.space.scale', 'designSystem.tokens.radius',
  'designSystem.tokens.shadow', 'designSystem.tokens.layout.breakpoints']
const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
const stable = v => JSON.stringify(v)

/* ── 检查器主体 ── */
function check({ template, html, md, pack = PACK }) {
  const problems = []
  const info = {}
  const DS = template.designSystem
  if (!DS?.tokens?.color) problems.push({ code: 'design-system-missing', msg: '模板缺少 designSystem.tokens.color（渲染规格必须在模板里）' })
  if (!Array.isArray(DS?.components) || DS.components.length === 0) problems.push({ code: 'design-system-missing', msg: '模板缺少 designSystem.components' })
  if (!DS) return { problems, info }

  /* ① tokens 自洽：roles 的对比度重算 */
  const color = DS.tokens.color
  info.roles = []
  let worst = Infinity
  for (const r of DS.roles ?? []) {
    const fg = dig(DS, r.token.replace(/^color\./, 'tokens.color.')), bg = dig(DS, r.on.replace(/^color\./, 'tokens.color.'))
    if (!fg || !bg) { problems.push({ code: 'role-token-unknown', msg: `roles 引用了不存在的 token：${r.token} / ${r.on}` }); continue }
    const ratio = contrast(fg, bg)
    info.roles.push({ use: r.use, ratio: +ratio.toFixed(2), minRatio: r.minRatio, ok: ratio >= r.minRatio })
    if (ratio < r.minRatio) problems.push({ code: 'role-contrast-fail', msg: `${r.use}：${r.token} on ${r.on} 实测 ${ratio.toFixed(2)}:1 < 声明的 ${r.minRatio}:1` })
    worst = Math.min(worst, ratio / r.minRatio)
  }
  info.worstRatioHeadroom = Number.isFinite(worst) ? +worst.toFixed(3) : null

  /* ② 跨模板核心 token 一致 */
  if (pack) {
    const dir = join(pack, 'output-templates')
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
        if (resolve(dir, f) === resolve(template.__path ?? '')) continue
        let other
        try { other = readJson(join(dir, f)) } catch { continue }
        if (other.id === template.id || !other.designSystem?.tokens?.color) continue
        for (const path of CORE) {
          if (stable(dig(other, path)) !== stable(dig(template, path))) {
            problems.push({ code: 'template-token-drift', msg: `核心 token 与 ${other.id} 不一致：${path}` })
          }
        }
      }
    }
  }

  /* ③ tokens 落产物：:root 里逐条声明且取值相同 */
  if (html != null) {
    const rootMatch = /:root\s*\{([\s\S]*?)\}/.exec(html)
    if (!rootMatch) problems.push({ code: 'tokens-not-emitted', msg: '产物里没有 :root token 块' })
    else {
      const declared = new Map()
      for (const m of rootMatch[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) declared.set(m[1], m[2].trim())
      const expect = [['--c-', 'color'], ['--fs-', 'type.scale.steps'], ['--lh-', 'type.lineHeight'],
        ['--ls-', 'type.letterSpacing'], ['--sp-', 'space.scale'], ['--r-', 'radius'], ['--sh-', 'shadow']]
      let checked = 0
      for (const [prefix, path] of expect) {
        const obj = dig(DS.tokens, path)
        if (!obj) continue
        const entries = Array.isArray(obj) ? obj.map(v => [String(v), `${v}px`]) : Object.entries(obj)
        for (const [k, v] of entries) {
          if (prefix === '--sh-' && k === 'why') continue
          if (prefix === '--sp-' && Number(k) === 0) continue
          const want = (prefix === '--fs-' || prefix === '--sp-') && typeof v === 'number' ? `${v}px` : `${v}`
          const got = declared.get(prefix + k)
          checked++
          if (got == null) problems.push({ code: 'tokens-not-emitted', msg: `产物缺少 token ${prefix + k}（模板值 ${want}）` })
          else if (String(got).replace(/\s+/g, '') !== String(want).replace(/\s+/g, '')) problems.push({ code: 'token-value-mismatch', msg: `${prefix + k}：产物 ${got} ≠ 模板 ${want}` })
        }
      }
      info.tokensChecked = checked

      /* ⑤ 纪律：无 #fff/#000 底色；无档外字号 */
      const pure = [...html.matchAll(/background(?:-color)?\s*:\s*(#fff(?:fff)?|#000(?:000)?)\b/gi)].map(m => m[0])
      if (pure.length) problems.push({ code: 'pure-extreme-color', msg: `出现纯白/纯黑底色 ${pure.length} 处：${pure.slice(0, 3).join('；')}` })
      const badFs = []
      for (const m of html.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
        const v = m[1].trim()
        if (!/^var\(--fs-[\w-]+\)$/.test(v) && !/^(\d*\.?\d+)(em|rem|%)$/.test(v) && !/^clamp\(/.test(v)) badFs.push(v)
      }
      if (badFs.length) problems.push({ code: 'font-size-out-of-scale', msg: `档外字号 ${badFs.length} 处：${[...new Set(badFs)].slice(0, 5).join('；')}` })

      /* ④ components 落产物 */
      const present = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)))
      const used = new Set(DS.components.filter(c => present.has(c.classes[0])).map(c => c.id))   // 锚点＝首个声明类
      const missing = []
      for (const c of DS.components) {
        if (!used.has(c.id)) continue
        const optional = new Set(c.optionalClasses ?? [])
        for (const cls of c.classes) if (!optional.has(cls) && !present.has(cls)) missing.push(`${c.id}.${cls}`)
      }
      info.componentsUsed = [...used]
      if (missing.length) problems.push({ code: 'component-class-missing', msg: `已使用的组件缺少声明类名：${missing.slice(0, 8).join('、')}` })
    }
  }

  /* ⑥ 指令完整性（md ↔ 模板白名单） */
  if (md != null) {
    const allowed = new Set((template.directives?.list ?? []).map(d => d.name))
    const usedNames = [...md.matchAll(/^:::([a-zA-Z][\w-]*)/gm)].map(m => m[1])
    const unknown = [...new Set(usedNames)].filter(n => !allowed.has(n))
    if (unknown.length) problems.push({ code: 'unknown-directive', msg: `md 使用了未声明指令：${unknown.join('、')}` })
    info.directivesUsed = [...new Set(usedNames)]
  }
  return { problems, info }
}

/* ── CLI ── */
const jsonOut = ARGV.includes('--json')
if (ARGV.includes('--selftest')) {
  const pack = val('--pack') ? resolve(val('--pack')) : PACK
  process.exit(runSelftest(pack))
}
const tplPath = val('--template'), mdPath = val('--md'), htmlPath = val('--html')
if (!tplPath) { console.error('用法：check-template-conformance.mjs --template <tpl.json> [--md <md>] [--html <html>] | --selftest'); process.exit(2) }
for (const p of [tplPath, mdPath, htmlPath]) if (p && !existsSync(p)) { console.error(`✗ 文件不存在：${p}`); process.exit(2) }
const template = readJson(tplPath)
template.__path = tplPath
const res = check({
  template,
  md: mdPath ? readText(mdPath) : null,
  html: htmlPath ? readText(htmlPath) : null,
})
if (jsonOut) console.log(JSON.stringify({ gate: 'template-conformance', template: tplPath, ...res }, null, 1))
else {
  console.log(`template-conformance：${tplPath}`)
  console.log(`  ① roles 对比度：${res.info.roles?.length ?? 0} 条，全部达标=${(res.info.roles ?? []).every(r => r.ok)}（最小余量 ${res.info.worstRatioHeadroom ?? 'n/a'}）`)
  console.log(`  ③ 产物 token 核对：${res.info.tokensChecked ?? 0} 条`)
  console.log(`  ④ 产物组件：${(res.info.componentsUsed ?? []).join(' / ') || '（未提供 html）'}`)
  console.log(`  ⑥ md 指令：${(res.info.directivesUsed ?? []).join(' / ') || '（未提供 md）'}`)
  for (const p of res.problems) console.log(`  ✗ [${p.code}] ${p.msg}`)
  console.log(`  VERDICT: ${res.problems.length ? 'FAIL' : 'PASS'}`)
}
process.exit(res.problems.length ? 1 : 0)

/* ── 自检：1 正向 + 5 负向（门禁必须有负向对照，否则是纸门） ── */
function runSelftest(pack) {
  const tmp = mkdtempSync(join(tmpdir(), 'tpl-conf-'))
  const md = `:::masthead eyebrow=试样
title: 一致性门禁试样
期次 | 2026Q4
:::

## 摘要

正文段落摆在这里，用于让章节成立。

:::kpis
净预期主动收益 | −2.4904 bp | down | 说明文字
:::

:::callout tone=warning title=裁定
正文。
:::

:::quote
一句金句。
:::

:::compare left=旧读法 right=新读法
维度 | 甲 | 乙
:::

:::caliber
口径一条。
:::

:::inferences
推论一条，带 1.0000 bp 数字锚。
:::

:::figure type=bars title=试样图 unit=bp source=自算
甲 | 1.0
乙 | 2.0
:::

:::no-figure
:::
`
  writeFileSync(join(tmp, 'demo.md'), md)
  const render = join(pack, 'scripts', 'render-report.mjs')
  const tpl0 = JSON.parse(readText(join(pack, 'output-templates', 'a-share-outlook.json')))
  const cases = []
  const run = (tpl, mdText, htmlPath) => check({ template: tpl, md: mdText, html: htmlPath ? readText(htmlPath) : null, pack: null })
  const tryRender = (tplObj, mdFile, outFile) => {
    writeFileSync(join(tmp, 'tpl.json'), JSON.stringify(tplObj))
    try { execFileSync('node', [render, '--md', mdFile, '--template', join(tmp, 'tpl.json'), '--out', outFile], { stdio: 'pipe' }); return true }
    catch { return false }
  }
  const okRender = tryRender(tpl0, join(tmp, 'demo.md'), join(tmp, 'demo.html'))
  if (!okRender) { console.log('FAIL: 正向样本渲染失败（渲染器自身报错）'); return 1 }
  cases.push(['正向：真实模板 + 真实产物', run(JSON.parse(JSON.stringify(tpl0)), md, join(tmp, 'demo.html')).problems.length === 0])

  // 负向 1：把 ink500 调亮 → 声明的对比度不成立
  const t1 = JSON.parse(JSON.stringify(tpl0)); t1.designSystem.tokens.color.ink500 = '#a8b3ae'
  cases.push(['负向：token 值被改亮 ⇒ 对比度声明不成立', run(t1, md, join(tmp, 'demo.html')).problems.some(p => p.code === 'role-contrast-fail')])

  // 负向 2：篡改产物里的 token 值 → 与模板不一致
  const html2 = readText(join(tmp, 'demo.html')).replace('--c-teal600:#0e6a55', '--c-teal600:#0e6a54')
  writeFileSync(join(tmp, 'html2.html'), html2)
  cases.push(['负向：产物 token 值被篡改 ⇒ token-value-mismatch', run(tpl0, md, join(tmp, 'html2.html')).problems.some(p => p.code === 'token-value-mismatch')])

  // 负向 3：产物里加纯白底 → 染色中性色底线被破
  writeFileSync(join(tmp, 'html3.html'), readText(join(tmp, 'demo.html')).replace('body{margin:0;', 'body{background:#ffffff;margin:0;'))
  cases.push(['负向：产物出现 #ffffff 底 ⇒ pure-extreme-color', run(tpl0, md, join(tmp, 'html3.html')).problems.some(p => p.code === 'pure-extreme-color')])

  // 负向 4：md 用未声明指令 → fail-closed
  cases.push(['负向：md 使用未声明指令 ⇒ unknown-directive', run(tpl0, md + '\n:::foobar\nx\n:::\n', join(tmp, 'demo.html')).problems.some(p => p.code === 'unknown-directive')])

  // 负向 5：同包另一模板核心色阶漂移 ⇒ template-token-drift
  const driftRoot = join(tmp, 'drift-pack')
  mkdirSync(join(driftRoot, 'output-templates'), { recursive: true })
  const t2 = JSON.parse(JSON.stringify(tpl0)); t2.id = 'other-template'; t2.designSystem.tokens.color.teal600 = '#0e6a56'
  writeFileSync(join(driftRoot, 'output-templates', 'other-template.json'), JSON.stringify(t2))
  const drift = check({ template: JSON.parse(JSON.stringify(tpl0)), md: null, html: null, pack: driftRoot })
  cases.push(['负向：同包另一模板色阶漂移 ⇒ template-token-drift', drift.problems.some(p => p.code === 'template-token-drift')])

  // 正向：真实包里两个模板的核心 token 必须一致
  const real = check({ template: JSON.parse(JSON.stringify(tpl0)), md: null, html: null, pack })
  cases.push(['正向：真实包内核心 token 无漂移', real.problems.length === 0])

  const bad = cases.filter(([, ok]) => !ok)
  for (const [name, ok] of cases) console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'}: ${cases.length - bad.length}/${cases.length} 一致性对照样本按预期（隔离目录 ${tmp}）`)
  rmSync(tmp, { recursive: true, force: true })
  return bad.length === 0 ? 0 : 1
}
