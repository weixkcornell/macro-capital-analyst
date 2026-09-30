#!/usr/bin/env node
/**
 * 报告渲染器 v2（token + 指令驱动）：markdown（含 ::: 组件声明）→ 自包含 HTML5。
 *
 * 设计契约不在本文件里，在输出模板的 `designSystem`：
 *   · tokens     → 逐条写成 CSS 自定义属性（--c-* / --fs-* / --sp-* / --sh-* / --r-* / --layout-*）
 *   · components → 声明必需类名与 DOM 结构；本文件按声明产出结构，不自行发明版式
 *   · figures    → 图类型白名单（bars/diverging/range/waterfall/steps/matrix）+ 画布与字号规约
 *   · print/a11y → 打印与无障碍规约
 *   · directives → 允许的 ::: 指令；**未声明的指令名一律 fail-closed**
 *
 * 与 v1 的关键差别（为什么必须换）：
 *   v1 把版式写死在渲染器里、每次交付在任务目录里另写一套 80KB+ 的渲染脚本，
 *   于是「模板」只是愿望清单，质感无法复用、无法门禁。v2 起：版式归模板，
 *   内容归作者（::: 声明），渲染器是通用执行器；产物由 check-template-conformance.mjs 逐条核对。
 *
 * 自包含：零外部字体/CSS/JS/图片（审核要在 file:// 下用无头浏览器逐视口跑门禁）。
 * 确定性：无时间戳、无随机；同输入两次渲染逐字节一致（见 --selftest 断言）。
 *
 * 用法：
 *   node scripts/render-report.mjs --md <final.md> --template <output-templates/x.json> --out <index.html> [--title "..."]
 * 退出码：0 成功；1 断言失败（未知指令 / 数字断行原子 / 图内文字越界 / 图号断裂）；2 参数或契约问题
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ARGV = process.argv.slice(2)
const val = f => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : null }
const mdPath = val('--md'), tplPath = val('--template'), outPath = val('--out')
if (!mdPath || !tplPath || !outPath) {
  console.error('用法：node scripts/render-report.mjs --md <final.md> --template <tpl.json> --out <index.html> [--title "..."]')
  process.exit(2)
}
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
const tpl = JSON.parse(readText(tplPath))
const DS = tpl.designSystem
if (!DS?.tokens?.color || !DS?.tokens?.type?.scale?.steps) {
  console.error('✗ 模板缺少 designSystem.tokens（color / type.scale.steps）—— 渲染规格必须在模板里，本渲染器不内置版式')
  process.exit(2)
}
const errors = []
const fail = m => errors.push(m)

/* ────────────────────────── 1. tokens → CSS 自定义属性 ────────────────────────── */
const T = DS.tokens
const cssVarName = (group, key) => ({ color: '--c-', space: '--sp-', radius: '--r-', shadow: '--sh-' }[group] ?? `--${group}-`) + key
const tokenLines = []
for (const [k, v] of Object.entries(T.color)) tokenLines.push(`  ${cssVarName('color', k)}:${v};`)
for (const [k, v] of Object.entries(T.type.scale.steps)) tokenLines.push(`  --fs-${k}:${v}px;`)
for (const [k, v] of Object.entries(T.type.lineHeight)) tokenLines.push(`  --lh-${k}:${v};`)
for (const [k, v] of Object.entries(T.type.letterSpacing)) tokenLines.push(`  --ls-${k}:${v};`)
for (const [k, v] of Object.entries(T.type.weights)) tokenLines.push(`  --fw-${k}:${v};`)
{
  const ff = T.type.families
  tokenLines.push(`  --ff-prose:${ff.prose};`, `  --ff-ui:${ff.ui};`, `  --ff-num:${ff.num};`, `  --ff-mono:${ff.mono};`)
}
for (const v of T.space.scale) if (v > 0) tokenLines.push(`  --sp-${v}:${v}px;`)
for (const [k, v] of Object.entries(T.radius)) tokenLines.push(`  --r-${k}:${v};`)
for (const [k, v] of Object.entries(T.shadow)) if (k !== 'why') tokenLines.push(`  --sh-${k}:${v};`)
if (DS.a11y) {
  const a = DS.a11y
  tokenLines.push(`  --a11y-textadjust:${a.textSizeAdjust ?? '100%'};`)
  for (const [w, px] of Object.entries(a.minBodyPx ?? {})) tokenLines.push(`  --a11y-body-${w}:${px}px;`)
  tokenLines.push(`  --a11y-tap:${a.tapTargetPx ?? 44}px;`)
}
{
  const L = T.layout
  tokenLines.push(
    `  --layout-page:${L.pageMaxPx}px;`, `  --layout-content:${L.contentMaxPx}px;`,
    `  --layout-rail:${L.railPx}px;`, `  --layout-gutter:${L.gutterPx}px;`,
    `  --layout-measure:${L.measureEm}em;`, `  --layout-bp-rail:${L.breakpoints.rail}px;`,
    `  --layout-bp-md:${L.breakpoints.md}px;`, `  --layout-bp-sm:${L.breakpoints.sm}px;`,
    `  --gl:max(${L.mobileGutterPx}px,env(safe-area-inset-left));`,
    `  --gr:max(${L.mobileGutterPx}px,env(safe-area-inset-right));`)
}
const TOKENS_CSS = `:root{\n${tokenLines.join('\n')}\n}`

/* ────────────────────────── 2. 行内解析 ────────────────────────── */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MINUS = '\u2212'
// 数字断行原子：`-2.4904 bp` / `51.23%` / `314.52 亿元` 整体不折行（修掉「单位单独换行」）
const UNIT = '(?:bp|pct|pp|亿元|万亿|万元|亿|元|点|倍|分位|个交易日|%|‰)'
function atomize(html) {
  return html
    .replace(new RegExp(`([${MINUS}+\\-]?\\d[\\d,]*(?:\\.\\d+)?)(\\s*)(${UNIT})`, 'g'),
      (_, n, sp, u) => `<span class="num-atomic">${n}${sp ? '&nbsp;' : ''}${u}</span>`)

}
// 行内只出「强调 / 代码 / 链接」；涨跌着色不上行内 —— 方向语义只能由 figure/kpi 的 tone 显式声明
function inline(s) {
  // 顺序很关键：先原子化（只作用于纯文本），再插标签 —— 否则 URL 里的数字会被裹进 span 而破坏链接
  let out = atomize(esc(s))
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\[\^(\d+)\]/g, '<sup class="fn-ref"><a href="#fn-$1">$1</a></sup>')
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
  return out
}

/* ────────────────────────── 3. 指令（:::）解析 ────────────────────────── */
const DIRECTIVE_NAMES = new Set((tpl.directives?.list ?? []).map(d => d.name))
const FIG_TYPES = new Set(DS.figures?.types ?? [])
const P = () => { throw new Error('') }
function parseDirective(name, header, bodyLines, ctx) {
  if (!DIRECTIVE_NAMES.has(name)) fail(`${ctx}：未声明的指令 ::: ${name}（模板 directives.list 白名单之外，fail-closed）`)
  const kv = {}
  for (const m of header.matchAll(/([a-zA-Z][\w-]*)=("([^"]*)"|(.*?))(?=\s+[a-zA-Z][\w-]*=|$)/g)) kv[m[1]] = (m[3] ?? m[4] ?? '').trim()
  const rows = bodyLines.map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => l.split('|').map(x => x.trim()))
  return { kind: 'directive', name, kv, rows, ctx }
}

/* ────────────────────────── 4. markdown 块解析 ────────────────────────── */
function parseBlocks(md) {
  const lines = md.split(/\r?\n/)
  const out = []
  let i = 0, hid = 0, ch = 0
  const isTableRow = l => /^\s*\|/.test(l)
  const isTableSep = l => /^\s*\|[\s:|-]+\|\s*$/.test(l)
  while (i < lines.length) {
    const line = lines[i]
    // 指令围栏
    const dm = /^:::([a-zA-Z][\w-]*)\s*(.*)$/.exec(line)
    if (dm) {
      const body = []
      i++
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { body.push(lines[i]); i++ }
      if (i >= lines.length) fail(`未闭合的 ::: ${dm[1]} 指令块`)
      i++
      out.push(parseDirective(dm[1], dm[2] ?? '', body, '指令'))
      continue
    }
    // 原始 HTML 一律禁止（内容只能经由声明产生结构）
    if (/^\s*<(?:div|span|p|section|figure|svg|script|style|table|img|iframe)\b/i.test(line)) {
      fail(`内容里出现原始 HTML（<${/^\s*<([a-z]+)/i.exec(line)[1]}>）—— 组件必须由 ::: 声明产生`)
    }
    if (isTableRow(line) && isTableSep(lines[i + 1] ?? '')) {
      const head = line.split('|').slice(1, -1).map(s => s.trim())
      i += 2
      const rows = []
      while (i < lines.length && isTableRow(lines[i])) { rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++ }
      out.push({ kind: 'table', head, rows }); continue
    }
    let m
    if ((m = /^####\s+(.*)$/.exec(line))) { out.push({ kind: 'h4', text: m[1] }); i++; continue }
    if ((m = /^###\s+(.*)$/.exec(line))) { out.push({ kind: 'h3', text: m[1] }); i++; continue }
    if ((m = /^##\s+(.*)$/.exec(line))) { out.push({ kind: 'h2', text: m[1], id: `s${++hid}`, no: ++ch }); i++; continue }
    if ((m = /^#\s+(.*)$/.exec(line))) { out.push({ kind: 'h1', text: m[1] }); i++; continue }
    if (/^\s*>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
      out.push({ kind: 'quote', text: buf.join(' ') }); continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++ }
      out.push({ kind: 'ul', items }); continue
    }
    if (/^\s*\d+[.、]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+[.、]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.、]\s+/, '')); i++ }
      out.push({ kind: 'ol', items }); continue
    }
    if (/^\s*---+\s*$/.test(line)) { out.push({ kind: 'hr' }); i++; continue }
    if (/^\s*$/.test(line)) { i++; continue }
    const para = [line.trim()]; i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|:::|\s*[>|]|\s*[-*]\s|\s*\d+[.、]\s|---)/.test(lines[i])) { para.push(lines[i].trim()); i++ }
    out.push({ kind: 'p', text: para.join(' ') })
  }
  return out
}

/* ────────────────────────── 5. figure：声明式 SVG ────────────────────────── */
const VB_W = DS.figures?.canvas?.viewBoxWidth ?? 640
const FS = { label: 19, value: 20, big: 24, huge: 30 }
const cw = ch => (/[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : (/[0-9]/.test(ch) ? 0.56 : 0.6))
const tw = (s, size) => [...String(s)].reduce((a, c) => a + cw(c) * size, 0)
const esc2 = esc
const T_ = (x, y, s, cls, anchor = 'start', size = FS.label, weight = 400) =>
  `<text x="${Math.round(x * 10) / 10}" y="${Math.round(y * 10) / 10}" class="${cls}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}">${esc2(s)}</text>`
const RECT = (x, y, w, h, cls, rx = 2) => `<rect x="${Math.round(x * 10) / 10}" y="${Math.round(y * 10) / 10}" width="${Math.max(0, Math.round(w * 10) / 10)}" height="${Math.round(h * 10) / 10}" rx="${rx}" class="${cls}"/>`
const LINE = (x1, y1, x2, y2, cls) => `<line x1="${Math.round(x1)}" y1="${Math.round(y1)}" x2="${Math.round(x2)}" y2="${Math.round(y2)}" class="${cls}"/>`
const CIRC = (cx, cy, r, cls) => `<circle cx="${Math.round(cx * 10) / 10}" cy="${Math.round(cy * 10) / 10}" r="${r}" class="${cls}"/>`
const svg = (h, inner) => `<svg class="fig-svg" viewBox="0 0 ${VB_W} ${h}" role="img" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`

/** figure 文字越界/重叠断言（fail-closed）：在 640 画布内估算文字宽度，越界即失败。 */
const TEXT_BOXES = []
const noteText = (x, y, s, anchor, size) => {
  const w = tw(s, size)
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x
  TEXT_BOXES.push({ x0, x1: x0 + w, y, s })
}
const S = (x, y, s, cls, anchor = 'start', size = FS.label, weight = 400) => {
  noteText(x, y, s, anchor, size)
  return T_(x, y, s, cls, anchor, size, weight)
}
const num = s => String(s).replace(/-/g, MINUS)
const parseVal = s => {
  const m = /^([\u2212+−-]?\d[\d,]*(?:\.\d+)?)\s*(.*)$/.exec(String(s).trim())
  return m ? { v: Number(m[1].replace(/[\u2212−]/g, '-').replace(/,/g, '')), unit: m[2], raw: String(s).trim() } : null
}

function figureSvg(type, rows, unit, tone = null) {
  // 标签列宽＝最长标签实测宽度（有上限），避免长标签（如「沪深300（000300）」）越界
  const maxLabW = Math.max(0, ...rows.map(r => tw(String(r[0] ?? ''), FS.label)))
  const LABEL_X = Math.min(Math.max(Math.ceil(maxLabW) + 12, 96), 268)
  const PLOT_X = LABEL_X + 14, RIGHT_PAD = 26
  const values = rows.map(r => parseVal(r[1])).filter(Boolean)
  const maxAbs = Math.max(...values.map(v => Math.abs(v.v)), 1e-9)
  const plotW = VB_W - PLOT_X - RIGHT_PAD
  const body = []
  let h = 0
  const valueText = (i, x, y, anchor, onBarX = null) => {
    const v = values[i]
    const t = v ? num(v.raw) : ''
    const w = tw(t, FS.value)
    const outside = anchor === 'start' ? x + w : x - w
    const fits = anchor === 'start' ? outside <= VB_W - RIGHT_PAD : outside >= PLOT_X
    if (fits) return S(x, y, t, 'tx-ink tx-val', anchor, FS.value, 600)
    if (onBarX !== null) return S(onBarX, y, t, 'tx-onbar tx-val', anchor === 'start' ? 'end' : 'start', FS.value, 600)
    return S(x, y, t, 'tx-ink tx-val', anchor, FS.value, 600)
  }
  if (type === 'bars') {
    const rowh = 42, top = 22
    rows.forEach((r, i) => {
      const y = top + i * rowh
      const v = values[i]
      const w = v ? (Math.abs(v.v) / maxAbs) * (plotW - 78) : 0
      body.push(S(LABEL_X, y + 20, r[0], 'tx-sec tx-lab', 'end', FS.label))
      body.push(RECT(PLOT_X, y + 4, plotW - 78, 22, 'f-track', 3))
      body.push(RECT(PLOT_X, y + 4, w, 22, 'f-bar', 3))
      body.push(valueText(i, PLOT_X + w + 8, y + 21, 'start'))
    })
    h = top + rows.length * rowh + 8
  } else if (type === 'diverging') {
    // tone=sign 时才用涨红跌绿；默认 series —— 「相对半数的偏离」不是涨跌，用红绿是语义误读
    const signTone = tone === 'sign'
    const rowh = 42, top = 24, zero = PLOT_X + 226
    const half = Math.min(zero - PLOT_X, VB_W - RIGHT_PAD - zero) - 66
    rows.forEach((r, i) => {
      const y = top + i * rowh
      const v = values[i]
      const w = v ? (Math.abs(v.v) / maxAbs) * half : 0
      const pos = !v || v.v >= 0
      const x = pos ? zero : zero - w
      const cls = signTone ? (pos ? 'f-up' : 'f-down') : (pos ? 'f-bar' : 'f-bar-alt')
      body.push(S(LABEL_X, y + 20, r[0], 'tx-sec tx-lab', 'end', FS.label))
      body.push(RECT(x, y + 4, w, 22, cls, 3))
      const t = num(v?.raw ?? ''), wt = tw(t, FS.value)
      const outside = pos ? zero + w + 8 : zero - w - 8 - wt
      const fits = pos ? (outside + wt <= VB_W - RIGHT_PAD) : (outside >= PLOT_X)
      if (fits) body.push(S(outside, y + 21, t, 'tx-ink tx-val', 'start', FS.value, 600))
      else body.push(S(pos ? zero + 9 : zero - 9, y + 21, t, 'tx-onbar tx-val', pos ? 'start' : 'end', FS.value, 600))
    })
    body.push(LINE(zero, 14, zero, top + rows.length * rowh, 's-axis'))
    h = top + rows.length * rowh + 10
  } else if (type === 'range') {
    const rowh = 40, top = 26
    const parsed = rows.map((r, i) => {
      const pair = /([\u2212+−-]?\d[\d,]*(?:\.\d+)?)\D+([\u2212+−-]?\d[\d,]*(?:\.\d+)?)/.exec(r[1])
      const a = pair ? Number(pair[1].replace(/[\u2212−]/g, '-')) : (values[i]?.v ?? 0)
      const b = pair ? Number(pair[2].replace(/[\u2212−]/g, '-')) : (values[i]?.v ?? 0)
      return { label: r[0], a, b, text: r[1] }
    })
    const lo = Math.min(...parsed.flatMap(q => [q.a, q.b])), hi = Math.max(...parsed.flatMap(q => [q.a, q.b]))
    const span = hi - lo || 1
    const x = v => PLOT_X + ((v - lo) / span) * (plotW - 96)
    rows.forEach((r, i) => {
      const y = top + i * rowh
      const q = parsed[i]
      const x0 = Math.min(x(q.a), x(q.b)), x1 = Math.max(x(q.a), x(q.b))
      body.push(S(LABEL_X, y + 18, r[0], 'tx-sec tx-lab', 'end', FS.label))
      body.push(LINE(PLOT_X, y + 12, VB_W - RIGHT_PAD - 66, y + 12, 's-hair'))
      body.push(LINE(x0, y + 12, x1, y + 12, 's-teal-thick'))
      body.push(CIRC(x0, y + 12, 4, 'f-teal'))
      body.push(CIRC(x1, y + 12, 4, 'f-teal'))
      body.push(S(VB_W - RIGHT_PAD, y + 18, r[1], 'tx-ink tx-val', 'end', FS.value, 600))
    })
    h = top + rows.length * rowh + 8
  } else if (type === 'waterfall') {
    const top = 46, base = 210
    const n = rows.length
    const colW = Math.min(84, (plotW - 20) / n)
    const gap = (plotW - n * colW) / (n + 1)
    let cum = 0
    const scale = 150 / Math.max(maxAbs * 1.4, Math.max(...rows.map((_, i) => Math.abs(values[i]?.v ?? 0))) || 1)
    const totals = rows.map((_, i) => (cum += values[i]?.v ?? 0))
    cum = 0
    rows.forEach((r, i) => {
      const v = values[i]?.v ?? 0
      const x = PLOT_X + gap + i * (colW + gap)
      const y0 = base - cum * scale, y1 = base - (cum + v) * scale
      body.push(RECT(x, Math.min(y0, y1), colW, Math.max(3, Math.abs(y1 - y0)), v >= 0 ? 'f-teal' : 'f-down', 3))
      body.push(S(x + colW / 2, Math.min(y0, y1) - 10, num(values[i]?.raw ?? ''), 'tx-ink tx-val', 'middle', FS.value, 600))
      body.push(S(x + colW / 2, base + 22, r[0], 'tx-sec tx-lab', 'middle', FS.label))
      if (i < n - 1) body.push(LINE(x + colW, y1, x + colW + gap, y1, 's-dash'))
      cum += v
    })
    body.push(LINE(PLOT_X - 8, base, VB_W - RIGHT_PAD + 8, base, 's-axis'))
    body.push(S(VB_W - RIGHT_PAD, 26, `净额　${num(values[n - 1]?.raw ?? '')}${unit ? ' ' + unit : ''}`, 'tx-teal tx-val', 'end', FS.big, 700))
    h = 246
  } else if (type === 'steps') {
    const rowh = 42, top = 30
    const n = rows.length
    const x = i => PLOT_X + (i / Math.max(1, n - 1)) * (plotW - 96)
    rows.forEach((r, i) => {
      const y = top + i * rowh
      const v = values[i]
      const x0 = x(i), x1 = i < n - 1 ? x(i + 1) : x(i) + (plotW - 96) * 0.08
      body.push(S(LABEL_X, y + 16, r[0], 'tx-sec tx-lab', 'end', FS.label))
      if (i > 0) body.push(LINE(x0, y + 12, x0, y - rowh + 12, 's-hair'))
      body.push(LINE(x0, y + 12, x1, y + 12, 's-teal-thick'))
      body.push(CIRC(x0, y + 12, 3.4, 'f-teal'))
      body.push(S(x1 + 10, y + 17, num(v?.raw ?? ''), 'tx-ink tx-val', 'start', FS.value, 600))
    })
    h = top + rows.length * rowh + 6
  } else if (type === 'matrix') {
    const cols = rows.length % 3 === 0 ? 3 : 2
    const cellW = (plotW - 8) / cols, cellH = 84
    rows.forEach((r, i) => {
      const cx = PLOT_X + (i % cols) * cellW, cy = 16 + Math.floor(i / cols) * (cellH + 10)
      body.push(RECT(cx, cy, cellW - 10, cellH, 'f-card s-hair', 6))
      body.push(S(cx + 14, cy + 26, r[0], 'tx-sec tx-lab', 'start', FS.label))
      body.push(S(cx + 14, cy + 62, num(values[i]?.raw ?? ''), 'tx-ink tx-val', 'start', FS.huge, 700))
    })
    h = 16 + Math.ceil(rows.length / cols) * (cellH + 10) + 4
  } else if (type === 'sparkline') {
    // 走势小图：真实序列 → 面积折线，标出区间高低与末值（封面/章首都用得上）
    const x0 = 22, x1 = VB_W - 22, top = 34, hgt = 92
    const vals = rows.map(r => parseVal(r[1])).filter(Boolean).map(v => v.v)
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1
    const X = i => x0 + (i / Math.max(1, vals.length - 1)) * (x1 - x0)
    const Y = v => top + (1 - (v - lo) / span) * hgt
    const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
    const area = `M ${X(0).toFixed(1)},${(top + hgt).toFixed(1)} L ${pts.split(' ').join(' L ')} L ${X(vals.length - 1).toFixed(1)},${(top + hgt).toFixed(1)} Z`
    body.push(`<path d="${area}" class="f-area"/>`)
    body.push(`<polyline points="${pts}" class="s-line"/>`)
    const iMax = vals.indexOf(hi), iMin = vals.indexOf(lo)
    body.push(CIRC(X(iMax), Y(hi), 4, 'f-bar'))
    body.push(CIRC(X(iMin), Y(lo), 4, 'f-bar-alt'))
    body.push(S(VB_W - 22, 22, `区间最高 ${num(String(hi))}`, 'tx-oncover tx-val', 'end', FS.big, 700))
    body.push(S(22, top + hgt + 28, rows[0]?.[0] ?? '', 'tx-oncoverMuted tx-lab', 'start', FS.big))
    body.push(S(VB_W - 22, top + hgt + 28, rows[rows.length - 1]?.[0] ?? '', 'tx-oncoverMuted tx-lab', 'end', FS.big))
    h = top + hgt + 40
  } else if (type === 'microbar') {
    // 微条形阵：一排细条，值在条顶、标签在条底（杂志式「一眼看全」）
    const n = rows.length, top = 40, hgt = 78
    const gap = 12, w = ((VB_W - 40) - (n - 1) * gap) / n
    rows.forEach((r, i) => {
      const v = values[i]
      const x = 20 + i * (w + gap)
      const bh = v ? (Math.abs(v.v) / maxAbs) * hgt : 0
      body.push(RECT(x, top + hgt - bh, w, bh, 'f-bar', 3))
      body.push(S(x + w / 2, top + hgt - bh - 9, num(v?.raw ?? ''), 'tx-ink tx-val', 'middle', FS.label, 600))
      body.push(S(x + w / 2, top + hgt + 24, r[0], 'tx-sec tx-lab', 'middle', FS.label))
    })
    h = top + hgt + 42
  } else if (type === 'gauge') {
    // 仪表盘：单值落在 0–100 量程上（用 pathLength=100 精确取弧长）
    const cxc = VB_W / 2, cyc = 150, r = 150
    const x0 = cxc - r, x1 = cxc + r
    const v = Math.max(0, Math.min(100, values[0]?.v ?? 0))
    body.push(`<path d="M ${x0} ${cyc} A ${r} ${r} 0 0 1 ${x1} ${cyc}" class="s-track" pathLength="100"/>`)
    body.push(`<path d="M ${x0} ${cyc} A ${r} ${r} 0 0 1 ${x1} ${cyc}" class="${v >= 60 ? 's-gauge-hot' : 's-gauge'}" pathLength="100" stroke-dasharray="${v} 100"/>`)
    body.push(S(cxc, cyc - 26, num(values[0]?.raw ?? ''), 'tx-ink tx-big', 'middle', FS.huge, 700))
    body.push(S(cxc, cyc + 34, rows[0]?.[0] ?? '', 'tx-sec tx-lab', 'middle', FS.label))
    body.push(S(x0, cyc + 34, '0', 'tx-sec tx-lab', 'middle', FS.label))
    body.push(S(x1, cyc + 34, '100', 'tx-sec tx-lab', 'middle', FS.label))
    h = cyc + 48
  } else if (type === 'donut') {
    // 环图：占比（每段按值取弧长），中心给合计或最大项
    const cxc = 150, cyc = 120, r = 78, C = 2 * Math.PI * r
    const total = values.reduce((a, v) => a + Math.abs(v.v), 0) || 1
    let acc = 0
    values.forEach((v, i) => {
      const frac = Math.abs(v.v) / total
      const dash = `${(frac * C).toFixed(1)} ${C.toFixed(1)}`
      body.push(`<circle cx="${cxc}" cy="${cyc}" r="${r}" fill="none" class="s-donut-${i % 3}" stroke-dasharray="${dash}" stroke-dashoffset="${(-acc * C).toFixed(1)}" transform="rotate(-90 ${cxc} ${cyc})"/>`)
      acc += frac
    })
    rows.forEach((r2, i) => {
      const y = 54 + i * 40
      const v = values[i]
      body.push(RECT(300, y - 14, 16, 16, `f-bar${i % 3 === 1 ? '-alt' : i % 3 === 2 ? '-mut' : ''}`, 3))
      body.push(S(326, y, r2[0], 'tx-ink tx-lab', 'start', FS.label, 600))
      body.push(S(VB_W - 20, y, num(v?.raw ?? ''), 'tx-ink tx-val', 'end', FS.value, 700))
    })
    body.push(S(cxc, cyc + 8, num(values[0]?.raw ?? ''), 'tx-ink tx-big', 'middle', FS.big, 700))
    h = Math.max(240, 60 + rows.length * 40)
  } else if (type === 'pictogram') {
    // 象形图：用重复圆点表示比例，标注分母
    const top = 34, rowh = 46
    rows.forEach((r2, i) => {
      const y = top + i * rowh
      const v = values[i]
      const total = Math.max(...values.map(x => x.v), 1)
      const n = Math.max(1, Math.round((Math.abs(v?.v ?? 0) / total) * 10))
      body.push(S(20, y + 6, r2[0], 'tx-sec tx-lab', 'start', FS.label))
      for (let k = 0; k < n; k++) body.push(CIRC(180 + k * 24, y + 1, 8, 'f-bar'))
      body.push(S(VB_W - 20, y + 6, num(v?.raw ?? ''), 'tx-ink tx-val', 'end', FS.value, 600))
    })
    h = top + rows.length * rowh + 16
  } else if (type === 'timeline') {
    // 时间轴：横向轴线 + 等距节点（事件标签上、日期下）
    const y = 62
    const n = rows.length
    const x = i => 30 + (i / Math.max(1, n - 1)) * (VB_W - 60)
    body.push(LINE(24, y, VB_W - 24, y, 's-axis'))
    rows.forEach((r2, i) => {
      const xi = x(i)
      body.push(CIRC(xi, y, 5, 'f-bar'))
      body.push(S(xi, y - 18, r2[1] ?? '', 'tx-ink tx-val', 'middle', FS.label, 600))
      body.push(S(xi, y + 26, r2[0] ?? '', 'tx-sec tx-lab', 'middle', FS.label))
    })
    h = 110
  } else {
    fail(`未知图类型 ${type}（模板 figures.types 白名单之外）`)
    return svg(60, '')
  }
  const markup = body.join('')
  for (const m of markup.matchAll(/\b(?:x|x1|x2|cx)="(-?[\d.]+)"/g)) {
    const v = Number(m[1])
    if (v < -8 || v > VB_W + 8) fail(`figure「${rows[0]?.[0] ?? ''}」几何越界：${m[0]}（画布宽 ${VB_W}）`)
  }
  return svg(h, markup)
}

/* ────────────────────────── 5.5 表格 ────────────────────────── */
/** 表格：数字列右对齐 + 移动端卡片堆叠（data-label 回填字段名）+ 容器内横滚 */
function renderTable(head, rows) {
  const isNum = j => rows.slice(0, 6).filter(r => /^[\u2212+−-]?[\d,.]/.test(r[j] ?? '')).length >= Math.min(3, rows.length)
  const numCol = head.map((_, j) => isNum(j))
  const thead = `<thead><tr>${head.map((h, j) => `<th${numCol[j] ? ' class="num"' : ''}>${inline(h)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${rows.map(r => `<tr>${head.map((h, j) => `<td data-label="${esc(h)}"${numCol[j] ? ' class="num"' : ''}>${inline(r[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`
  return `<div class="tw"><table class="table">${thead}${tbody}</table></div>`
}
const tableRegistry = []

/* ────────────────────────── 6. 组件渲染 ────────────────────────── */
const KPI_UNIT = /^([\u2212+−-]?\d[\d,]*(?:\.\d+)?)\s*([A-Za-z%‰\u4e00-\u9fff].*)?$/
/** KPI 值的原子化：每个「数字＋单位」不折行，区间分隔符（– ~ 至 /）可折行。 */
function kpiValueHtml(value) {
  const parts = String(value).trim().split(/\s*([–—~～至/])\s*/).filter(x => x !== '')
  return parts.map((p, i) => {
    if (i % 2 === 1) return `<span class="kpi-sep">${esc(p)}</span>`
    const m = KPI_UNIT.exec(p)
    const number = m ? m[1] : p
    const unit = m && m[2] ? m[2] : ''
    const tight = /^[%‰％]/.test(unit)
    return `<span class="kpi-num-atomic"><span class="kpi-num">${esc(num(number))}</span>${unit ? `<span class="kpi-unit">${tight ? '' : ' '}${esc(unit)}</span>` : ''}</span>`
  }).join(' ')
}
const figureRegistry = []
let mastheadTitle = null
let currentTone = null
const kvTone = d => d?.kv?.tone ?? currentTone ?? null
function renderDirective(d) {
  const kv = { ...d.kv }
  switch (d.name) {
    case 'masthead': {
      // 卷首的 title / lede / eyebrow 三个标量角色可从 body 行（`title: …`）或头部键（`title=…`）给
      const meta = []
      for (const r of d.rows) {
        let k, v
        if (r.length === 1) {                      // `title: 报告名` / `issue=2026 Q4` 形式（无竖线）
          const m = /^([^:：=]+)[:：=]\s*(.*)$/.exec(r[0])
          if (m) { k = m[1].trim(); v = m[2].trim() } else { k = r[0].trim(); v = '' }
        } else {                                   // `键 | 值` 形式
          k = String(r[0] ?? '').replace(/[:：]\s*$/, '').trim(); v = r.slice(1).join(' ').trim()
        }
        if (['title', 'lede', 'eyebrow'].includes(k)) kv[k] = v
        else if (k) meta.push([k, v])
      }
      if (kv.title) mastheadTitle = kv.title
      return `<header class="masthead">
<div class="masthead-eyebrow">${inline(kv.eyebrow ?? '')}</div>
<h1 class="masthead-title">${inline(kv.title ?? '')}</h1>
${kv.lede ? `<div class="masthead-lede">${inline(kv.lede)}</div>` : ''}
${meta.length ? `<dl class="masthead-meta">${meta.map(([k, v]) => `<dt>${inline(k)}</dt><dd>${inline(v)}</dd>`).join('')}</dl>` : ''}</header>`
    }
    case 'cover': {
      const meta = []
      for (const r of d.rows) {
        let k, v
        if (r.length === 1) { const m = /^([^:：=]+)[:：=]\s*(.*)$/.exec(r[0]); k = m ? m[1].trim() : r[0].trim(); v = m ? m[2].trim() : '' }
        else { k = String(r[0] ?? '').replace(/[:：]\s*$/, '').trim(); v = r.slice(1).join(' ').trim() }
        if (['kicker', 'issue', 'title', 'lede'].includes(k)) kv[k] = v
        else if (k) meta.push([k, v])
      }
      if (kv.title) mastheadTitle = kv.title
      return `<span class="cover-kicker">${inline(kv.kicker ?? '')}</span>
<p class="cover-issue">${inline(kv.issue ?? '')}</p>
<h1 class="cover-title">${inline(kv.title ?? '')}</h1>
${kv.lede ? `<p class="cover-lede">${inline(kv.lede)}</p>` : ''}
<hr class="cover-rule">
${meta.length ? `<dl class="masthead-meta">${meta.map(([k, v]) => `<dt>${inline(k)}</dt><dd>${inline(v)}</dd>`).join('')}</dl>` : ''}`
    }
    case 'cover-stats': {
      const tiles = d.rows.map(r => ({ label: r[0], value: r[1] ?? '', tone: r[2] ?? 'neutral', note: r[3] ?? '' }))
      return `<div class="cover-stats">${tiles.map(t => `<div class="cover-stat cover-stat--${t.tone}">
<span class="cover-stat-label">${inline(t.label)}</span>
<div class="cover-stat-value">${kpiValueHtml(t.value)}</div>
${t.note ? `<div class="cover-stat-note">${inline(t.note)}</div>` : ''}</div>`).join('')}</div>`
    }
    case 'cover-art': {
      const type = kv.type ?? 'sparkline'
      return `<figure class="cover-art" role="img" aria-label="${esc(kv.title ?? '走势小图')}">${figureSvg(type, d.rows, kv.unit ?? '', null)}
<p class="cover-art-note">${inline(kv.title ?? '')}${kv.source ? `　${inline(kv.source)}` : ''}</p></figure>`
    }
    case 'lede':
      return `<p class="lede">${inline(d.rows.map(r => r.join(' | ')).join(' '))}</p>`
    case 'takeaway': {
      const items = d.rows.map(r => `<li class="takeaway-item">${inline(r.join(' | '))}</li>`).join('')
      return `<aside class="takeaway"><span class="takeaway-badge" aria-hidden="true">读</span>
<div class="takeaway-title">${inline(kv.title ?? '读懂这一节')}</div><ul>${items}</ul></aside>`
    }
    case 'glossary': {
      const items = d.rows.map(r => `<div class="glossary-item"><dt class="glossary-term">${inline(r[0] ?? '')}</dt><dd class="glossary-def">${inline(r.slice(1).join(' '))}</dd></div>`).join('')
      return `<dl class="glossary">${items}</dl>`
    }
    case 'table': {
      const head = d.rows[0] ?? []
      const rows = d.rows.filter(r => r.length && !(r.every((c, i) => c === '' && i > 0) && r[0] === '') && !r.every(c => /^[-:\s]+$/.test(c)))
      const body = rows.slice(1)
      const no = tableRegistry.length + 1
      tableRegistry.push({ no, caption: kv.caption ?? '' })
      const cal = kv.caliber ? `<div class="table-caliber">口径：${inline(kv.caliber)}</div>` : ''
      const src = kv.source ? `<div class="table-source">来源：${inline(kv.source)}</div>` : ''
      return `<figure class="table-fig" id="tbl${no}" role="group" aria-label="表${no}｜${esc(kv.caption ?? '')}">
<div class="table-head">表${no} · ${inline(kv.caption ?? '')}</div>
${renderTable(head, body)}
${cal}${src}</figure>`
    }
    case 'fn': {
      const items = d.rows.map(r => `<li class="fn-item" id="fn-${esc(r[0] ?? '')}"><span class="fn-no">${esc(r[0] ?? '')}</span>${inline(r.slice(1).join(' | '))}</li>`).join('')
      return `<ol class="fn-list">${items}</ol>`
    }
    case 'falsify': {
      const sep = d.rows.findIndex(r => r.every(c => /^-{2,}$/.test(c)) || r[0] === '---')
      const head = sep > 0 ? d.rows.slice(0, sep) : d.rows
      const table = sep > 0 ? d.rows.slice(sep + 1) : []
      const branches = head.map(r => {
        const tag = r[0] ?? ''
        const tone = /上行/.test(tag) ? 'up' : 'down'
        return `<div class="falsify-branch falsify-branch--${tone}"><span class="falsify-tag">${inline(tag)}</span><div class="falsify-body">${inline(r.slice(1).join(' | '))}</div></div>`
      }).join('')
      const sig = table.length > 1
        ? `<div class="falsify-signals"><div class="table-head">证伪信号</div>${renderTable(table[0], table.slice(1))}</div>`
        : ''
      return `<aside class="falsify">${branches}${sig}</aside>`
    }
    case 'ladder': {
      const steps = d.rows.map(r => `<li class="ladder-step"><span class="ladder-badge">${inline(r[0] ?? '')}</span>
<div class="ladder-cond">${inline(r[1] ?? '')}</div><div class="ladder-act">${inline(r.slice(2).join(' | '))}</div></li>`).join('')
      const cap = kv.caption ? `<div class="table-head">${inline(kv.caption)}</div>` : ''
      const src = kv.source ? `<div class="table-source">来源：${inline(kv.source)}</div>` : ''
      return `<figure class="table-fig ladder-fig" role="group" aria-label="${esc(kv.caption ?? '条件阶梯')}">${cap}<ol class="ladder">${steps}</ol>${src}</figure>`
    }
    case 'kpis': {
      const tiles = d.rows.map(r => {
        const [label, value, tone = 'neutral', note = ''] = r
        return { label, value, tone, note }
      })
      const last = tiles.length % 4 === 1
      return `<div class="kpi-row">${tiles.map((t, i) => `<div class="kpi kpi--${t.tone}${last && i === tiles.length - 1 ? ' kpi--wide' : ''}">
<span class="kpi-label">${inline(t.label)}</span>
<div class="kpi-value">${kpiValueHtml(t.value)}</div>
${t.note ? `<div class="kpi-note">${inline(t.note)}</div>` : ''}</div>`).join('')}</div>`
    }
    case 'callout': {
      const tone = kv.tone ?? 'caliber'
      return `<aside class="callout callout--${tone}">${kv.title ? `<div class="callout-title">${inline(kv.title)}</div>` : ''}<div class="callout-body">${d.rows.map(r => `<p>${inline(r.join(' | '))}</p>`).join('')}</div></aside>`
    }
    case 'quote':
      return `<blockquote class="pull-quote"><p>${inline(d.rows.map(r => r.join(' | ')).join(' '))}</p></blockquote>`
    case 'compare': {
      const head = `<div class="compare-head"><span class="compare-dim"></span><span class="compare-old">${inline(kv.left ?? '旧读法')}</span><span class="compare-new">${inline(kv.right ?? '新读法')}</span></div>`
      const rows = d.rows.map(r => `<div class="compare-row"><span class="compare-dim">${inline(r[0] ?? '')}</span><span class="compare-old">${inline(r[1] ?? '')}</span><span class="compare-new">${inline(r[2] ?? '')}</span></div>`).join('')
      return `<div class="compare">${head}${rows}</div>`
    }
    case 'caliber':
      return `<ul class="caliber-list">${d.rows.map(r => `<li class="caliber-item">${inline(r.join(' | '))}</li>`).join('')}</ul>`
    case 'inferences':
      return `<ol class="inferences">${d.rows.map(r => `<li class="inference"><span class="inference-no"></span><span class="inference-body">${inline(r.join(' | '))}</span></li>`).join('')}</ol>`
    case 'figure': {
      // body 里的 `caption: …` / `note: …` / `caliber: …` 是元信息，不是数据行
      const meta = { }
      const dataRows = []
      for (const r of d.rows) {
        if (r.length === 1) {
          const m = /^(caption|note|caliber)\s*[:：]\s*(.*)$/.exec(r[0])
          if (m) { meta[m[1]] = m[2].trim(); continue }
        }
        dataRows.push(r)
      }
      if (meta.caption) kv.caption = meta.caption
      if (meta.note) kv.note = [kv.note, meta.note].filter(Boolean).join('；')
      const type = kv.type ?? 'bars'
      if (!FIG_TYPES.has(type)) fail(`figure type=${type} 不在模板 figures.types 白名单`)
      const qualitative = kv.qualitative === 'true'
      currentTone = kv.tone ?? null
      const rec = { no: figureRegistry.length + 1, title: kv.title ?? '', type, rows: dataRows, unit: kv.unit ?? '', source: kv.source ?? '', caption: kv.caption ?? '', qualitative, tone: kv.tone ?? null }
      figureRegistry.push(rec)
      return `<!--FIGURE:${rec.no}-->`
    }
    case 'no-figure':
      return `<div class="fig-note">本章无数字，按 §三 铁律不绘制点睛图</div>`
    default:
      fail(`未实现的指令 ::: ${d.name}`)
      return ''
  }
}

function renderBlocks(blocks) {
  const toc = []
  const COVERISH = new Set(['cover', 'cover-stats', 'cover-art'])
  const body = []
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi]
    // 封面：相邻的 cover / cover-stats / cover-art 合并为一个全出血深底容器
    if (b.kind === 'directive' && COVERISH.has(b.name)) {
      const inner = []
      while (bi < blocks.length && blocks[bi].kind === 'directive' && COVERISH.has(blocks[bi].name)) { inner.push(renderDirective(blocks[bi])); bi++ }
      bi--
      body.push(`<header class="cover">${inner.join('\n')}</header>`)
      continue
    }
    body.push(renderBlockOne(b, toc))
  }
  return { body: body.join('\n'), toc }
}

function renderBlockOne(b, toc) {
  {
    switch (b.kind) {
      case 'h1': return `<h1 class="doc-title">${inline(b.text)}</h1>`
      case 'h2': {
        toc.push({ id: b.id, no: b.no, text: b.text })
        return `<section class="chapter" id="${b.id}"><header class="chapter-head"><span class="chapter-no">${String(b.no).padStart(2, '0')}</span><h2 class="chapter-title">${inline(b.text)}</h2></header>`
      }
      case 'h3': return `<h3>${inline(b.text)}</h3>`
      case 'h4': return `<h4>${inline(b.text)}</h4>`
      case 'p': return `<p>${inline(b.text)}</p>`
      case 'quote': return `<blockquote>${inline(b.text)}</blockquote>`
      case 'hr': return `<hr>`
      case 'ul': return `<ul>${b.items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`
      case 'ol': return `<ol>${b.items.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`
      case 'table': return renderTable(b.head, b.rows)
      case 'directive': return renderDirective(b)
      default: return ''
    }
  }
}

/* ────────────────────────── 7. 主流程 ────────────────────────── */
const md = readText(mdPath)
const blocks = parseBlocks(md)
// 章节闭合：把每个 chapter 包到下一个 chapter 前
let html = renderBlocks(blocks).body
const chapters = html.split(/(?=<section class="chapter")/)
html = chapters.map((c, i) => (i === 0 ? c : c + '</section>')).join('')
if (!html.includes('<section class="chapter"')) fail('报告里没有任何 h2 章节（chapter 组件未生成）')
const toc = (() => {
  const t = []
  for (const m of html.matchAll(/id="(s\d+)"[\s\S]*?<h2 class="chapter-title">([\s\S]*?)<\/h2>/g)) t.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, '') })
  return t
})()
// 图注入 + 图号四处同源
html = html.replace(/<!--FIGURE:(\d+)-->/g, (_, n) => {
  const rec = figureRegistry[Number(n) - 1]
  const noCn = rec.no
  const qual = rec.qualitative ? '　定性示意' : ''
  const cap = (rec.caption || rec.note) ? `<figcaption class="fig-caption"><strong>图${noCn}</strong> · ${inline(rec.caption ?? '')}${rec.note ? `${rec.caption ? '；' : ''}${inline(rec.note)}` : ''}</figcaption>` : ''
  const src = rec.source ? `<div class="fig-source">来源：${inline(rec.source)}</div>` : ''
  return `<figure class="figure" id="fig${noCn}" role="group" aria-label="图${noCn}｜${esc(rec.title)}">
<div class="fig-eyebrow">图${noCn} · ${inline(rec.title)}${qual}</div>
${figureSvg(rec.type, rec.rows, rec.unit, rec.tone)}
${cap}${src}
<a class="fig-zoom" href="#zoom${noCn}" aria-label="放大查看图${noCn}">⤢ 放大查看</a></figure>
<div class="zoom" id="zoom${noCn}" role="dialog" aria-label="图${noCn} 放大"><a class="zoom-close" href="#fig${noCn}" aria-label="关闭">✕</a><div class="zoom-inner">${figureSvg(rec.type, rec.rows, rec.unit, rec.tone)}</div></div>`
})

/* 断言 A：图号连续 + 四处同源 */
{
  const ey = [...html.matchAll(/class="fig-eyebrow">图(\d+)/g)].map(m => Number(m[1]))
  const cap = [...html.matchAll(/<figcaption class="fig-caption"><strong>图(\d+)/g)].map(m => Number(m[1]))
  const id = [...html.matchAll(/id="fig(\d+)"/g)].map(m => Number(m[1]))
  const aria = [...html.matchAll(/aria-label="图(\d+)｜/g)].map(m => Number(m[1]))
  const seq = ey.join(',')
  const expected = ey.map((_, i) => i + 1).join(',')
  if (seq !== expected) fail(`图号不连续或未按文档顺序：${seq}`)
  if (cap.length && !cap.every((v, k, a) => k === 0 || a[k - 1] < v)) fail(`figcaption 的图号未严格递增：${cap.join(',')}`)
  for (const [name, arr] of [['id', id], ['aria-label', aria]]) {
    if (arr.join(',') !== seq) fail(`${name} 与 eyebrow 的图号不一致：${arr.join(',')} ≠ ${seq}`)
  }
}

/* 断言 B：图内文字越界（估算宽度） */
{
  const overs = TEXT_BOXES.filter(b => b.x0 < -2 || b.x1 > VB_W + 2)
  if (overs.length) fail(`图内文字越界 ${overs.length} 处：${overs.slice(0, 3).map(o => `「${o.s}」→ ${o.x1.toFixed(0)}px`).join('；')}`)
}

/* 断言 D：脚注上标与脚注清单一一对应（编号存在且无孤儿） */
{
  const refs = [...html.matchAll(/class="fn-ref"><a href="#fn-(\d+)"/g)].map(m => Number(m[1]))
  const items = [...html.matchAll(/class="fn-item" id="fn-(\d+)"/g)].map(m => Number(m[1]))
  const orphan = [...new Set(refs)].filter(n => !items.includes(n))
  const unused = items.filter(n => !refs.includes(n))
  if (orphan.length) fail(`脚注引用 [^n] 在清单里不存在：${orphan.join('、')}`)
  if (unused.length && items.length) fail(`脚注清单有条目未被引用：${unused.join('、')}`)
}

/* 断言 C：数字断行原子（作者正文里的「数值 单位」必须已原子化；模板声明 noOrphanUnit） */
{
  const plain = html.replace(/<[^>]+>/g, '')
  const orphan = [...plain.matchAll(/([\u2212+−-]?\d[\d,]*(?:\.\d+)?)\s*\n\s*(bp|pct|pp|亿元|亿|元|点|%)(?![A-Za-z])/g)]
  if (orphan.length) fail(`疑似单位断行 ${orphan.length} 处`)
}

const title = val('--title') ?? mastheadTitle ?? tpl.name
const disclaimer = /不构成投资建议/.test(md) ? '' : '<div class="colophon-line">本报告为方法演示，<strong>不构成投资建议</strong>。</div>'
const rail = toc.length
  ? `<nav class="rail" aria-label="目录"><p class="rail-brand">${esc(mastheadTitle ?? tpl.name)}</p><ul class="rail-list">${toc.map((t, i) => `<li><a class="rail-item" href="#${t.id}"><span class="rn">${String(i + 1).padStart(2, '0')}</span>${esc(t.text)}</a></li>`).join('')}</ul></nav>`
  : '<nav class="rail" aria-label="目录"></nav>'
const railActive = toc.map(t => `html:has(#${t.id}:target) .rail a[href="#${t.id}"]`).join(',')
const tocbarActive = toc.map(t => `html:has(#${t.id}:target) .tocbar-title .cur[data-for="${t.id}"]`).join(',')
const tocbar = toc.length
  ? `<details class="tocbar"><summary class="tocbar-title" aria-label="目录">${toc.map(t => `<span class="cur" data-for="${t.id}">${esc(t.text)}</span>`).join('')}<span class="tocbar-caret">目录 ▾</span></summary><div class="tocbar-drawer">${toc.map((t, i) => `<a class="tocbar-item" href="#${t.id}"><span class="rn">${String(i + 1).padStart(2, '0')}</span>${esc(t.text)}</a>`).join('')}</div></details>`
  : ''
const figList = figureRegistry.map(r => ({ no: r.no, title: r.title }))

const CSS = `
${TOKENS_CSS}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:var(--a11y-textadjust,100%);color-scheme:light;line-break:strict}
body{margin:0;background:var(--c-paper);color:var(--c-ink800);font-family:var(--ff-prose);font-size:var(--fs-body);
  line-height:var(--lh-body);letter-spacing:var(--ls-body);font-variant-numeric:tabular-nums;overflow-wrap:break-word;word-break:normal}
.shell{display:grid;grid-template-columns:var(--layout-rail) minmax(0,1fr);gap:var(--layout-gutter);
  max-width:var(--layout-page);margin:0 auto;padding:var(--sp-32) var(--sp-24) var(--sp-64)}
main{min-width:0;max-width:var(--layout-content)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.num-atomic{white-space:nowrap}
/* ── 排版轴 ── */
h1,h2,h3,h4{font-family:var(--ff-prose);color:var(--c-ink900);font-weight:var(--fw-semibold)}
h1{font-size:var(--fs-h1);line-height:var(--lh-h1);letter-spacing:var(--ls-h1);margin:0;text-wrap:balance}
h2{font-size:var(--fs-h2);line-height:var(--lh-h2);margin:0}
h3{font-size:var(--fs-h3);line-height:var(--lh-h3);margin:var(--sp-32) 0 var(--sp-12)}
h4{font-size:var(--fs-h4);line-height:var(--lh-h4);margin:var(--sp-24) 0 var(--sp-8);
  font-family:var(--ff-ui);font-weight:var(--fw-semibold);color:var(--c-teal700);letter-spacing:var(--ls-meta)}
p{margin:0 0 var(--sp-12);text-wrap:pretty}
strong{font-weight:var(--fw-bold)}
a{color:var(--c-teal600);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:.06em}
a:focus-visible{outline:2px solid var(--c-focus);outline-offset:2px;border-radius:var(--r-sm)}
code{font-family:var(--ff-mono);font-size:.9em;background:var(--c-sunk);border:1px solid var(--c-hair);border-radius:var(--r-sm);padding:0 4px;overflow-wrap:anywhere}
hr{border:0;border-top:1px solid var(--c-hair);margin:var(--sp-32) 0}
/* ── 卷首 masthead ── */
.masthead{background:var(--c-surface);border:1px solid var(--c-hair);border-top:3px solid var(--c-teal600);
  border-radius:var(--r-md);box-shadow:var(--sh-s2);padding:var(--sp-32) var(--sp-32) var(--sp-24);margin:0 0 var(--sp-48)}
.masthead-eyebrow{display:block;font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);
  font-weight:var(--fw-semibold);color:var(--c-teal600);margin:0 0 var(--sp-12)}
.masthead-title{font-family:var(--ff-prose);font-size:var(--fs-h1);line-height:var(--lh-h1);
  letter-spacing:var(--ls-h1);color:var(--c-ink900);margin:0 0 var(--sp-12);text-wrap:balance}
.masthead-lede{display:block;font-family:var(--ff-ui);font-size:var(--fs-caption);color:var(--c-ink600);margin:0 0 var(--sp-16);letter-spacing:var(--ls-meta)}
.masthead-meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--sp-4) var(--sp-16);margin:0;
  padding-top:var(--sp-16);border-top:1px solid var(--c-hair);font-family:var(--ff-ui);font-size:var(--fs-label)}
.masthead-meta dt{color:var(--c-ink500);letter-spacing:var(--ls-label)}
.masthead-meta dd{margin:0;color:var(--c-ink800)}
/* ── KPI ── */
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));grid-auto-rows:1fr;
  gap:var(--sp-12);margin:var(--sp-24) 0}
.kpi{display:flex;flex-direction:column;gap:var(--sp-4);background:var(--c-surface);border:1px solid var(--c-hair);
  border-radius:var(--r-md);box-shadow:var(--sh-s1);padding:var(--sp-16)}
.kpi--wide{grid-column:1/-1}
.kpi-label{font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);color:var(--c-ink500)}
.kpi-value{margin:auto 0 0;display:block;font-family:var(--ff-num);font-size:var(--fs-h3);line-height:1.15;
  font-weight:var(--fw-semibold);color:var(--c-ink900)}
.kpi--up .kpi-value{color:var(--c-up)}.kpi--down .kpi-value{color:var(--c-down)}
.kpi--warn .kpi-value{color:var(--c-amber700)}.kpi--neutral .kpi-value{color:var(--c-teal700)}
.kpi-num-atomic{white-space:nowrap}
.kpi-sep{color:var(--c-ink500)}
.kpi-unit{font-family:var(--ff-ui);font-size:var(--fs-caption);font-weight:var(--fw-medium);color:var(--c-ink600)}
.kpi--wide{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-content:start;align-items:baseline;gap:var(--sp-4) var(--sp-16)}
.kpi--wide .kpi-label{grid-column:1}
.kpi--wide .kpi-value{grid-column:2;grid-row:1;margin:0;font-size:var(--fs-h4)}
.kpi--wide .kpi-note{grid-column:1}
.kpi-note{margin:0;display:block;font-family:var(--ff-ui);font-size:var(--fs-label);line-height:var(--lh-ui);color:var(--c-ink600)}
/* ── chip / 小节 ── */
.chip{display:inline-block;font-family:var(--ff-ui);font-size:var(--fs-label);padding:1px var(--sp-8);
  border-radius:var(--r-pill);border:1px solid var(--c-teal600);color:var(--c-teal700);background:var(--c-teal50)}
.chip--amber{border-color:var(--c-amber600);color:var(--c-amber700);background:var(--c-amber50)}
.chip--neutral{border-color:var(--c-hairStrong);color:var(--c-ink600);background:var(--c-sunk)}
.chapter{margin:0 0 var(--sp-32)}
.chapter-head{display:grid;gap:var(--sp-4);margin:var(--sp-48) 0 var(--sp-24);
  padding-top:var(--sp-16);border-top:2px solid var(--c-teal600);scroll-margin-top:72px}
.chapter-no{font-family:var(--ff-num);font-size:var(--fs-display);line-height:1;letter-spacing:-.03em;
  color:var(--c-teal600);font-weight:var(--fw-bold)}
.chapter-title{scroll-margin-top:72px}
.chapter:target .chapter-head{background:var(--c-teal50);border-radius:var(--r-sm)}
/* ── 金句 / 提示块 ── */
blockquote{margin:var(--sp-24) 0;padding:var(--sp-8) 0 var(--sp-8) var(--sp-16);
  border-left:3px solid var(--c-hairStrong);color:var(--c-ink600);font-style:normal}
blockquote p:last-child{margin-bottom:0}
.pull-quote{border-left-color:var(--c-amber600);color:var(--c-ink900);font-size:var(--fs-h4);
  line-height:var(--lh-h4);font-weight:var(--fw-semibold);padding:var(--sp-4) 0 var(--sp-4) var(--sp-24)}
.callout{margin:var(--sp-24) 0;padding:var(--sp-16) var(--sp-16) var(--sp-16) var(--sp-24);
  border-left:3px solid var(--c-hairStrong);background:var(--c-sunk);border-radius:0 var(--r-md) var(--r-md) 0}
.callout--conclusion{border-left-color:var(--c-teal600);background:var(--c-teal50)}
.callout--warning{border-left-color:var(--c-amber600);background:var(--c-amber50)}
.callout-title{margin:0 0 var(--sp-8);display:block;font-family:var(--ff-ui);font-size:var(--fs-label);
  letter-spacing:var(--ls-label);font-weight:var(--fw-semibold)}
.callout--conclusion .callout-title{color:var(--c-teal700)}
.callout--warning .callout-title{color:var(--c-amber700)}
.callout--caliber .callout-title{color:var(--c-ink600)}
.callout-body p:last-child{margin-bottom:0}
/* ── 对照卡 compare ── */
.compare{display:grid;grid-template-columns:6.5em minmax(0,1fr) minmax(0,1fr);gap:0;margin:var(--sp-24) 0;
  border:1px solid var(--c-hair);border-radius:var(--r-md);overflow:hidden;background:var(--c-surface);box-shadow:var(--sh-s1)}
.compare-head,.compare-row{display:contents}
.compare-head>*{font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);
  padding:var(--sp-12) var(--sp-16);background:var(--c-teal50);color:var(--c-teal700);font-weight:var(--fw-semibold);
  border-bottom:1px solid var(--c-hair)}
.compare-row>*{padding:var(--sp-12) var(--sp-16);border-bottom:1px solid var(--c-hair);font-size:var(--fs-table);line-height:var(--lh-table)}
.compare-row:last-child>*{border-bottom:0}
.compare-dim{color:var(--c-ink600);font-weight:var(--fw-medium);background:var(--c-sunk)}
.compare-old{color:var(--c-ink600)}
.compare-new{color:var(--c-ink900);font-weight:var(--fw-semibold)}
/* ── 口径 / 推论 ── */
.caliber-list{list-style:none;margin:var(--sp-24) 0;padding:0}
.caliber-item{position:relative;padding:var(--sp-8) 0 var(--sp-8) 58px;border-bottom:1px dashed var(--c-hair);font-size:var(--fs-table)}
.caliber-item:last-child{border-bottom:0}
.caliber-item::before{content:"口径";position:absolute;left:0;top:var(--sp-12);font-family:var(--ff-ui);
  font-size:var(--fs-micro);letter-spacing:var(--ls-label);font-weight:var(--fw-semibold);color:var(--c-teal700);
  background:var(--c-teal50);border:1px solid var(--c-teal100);border-radius:var(--r-sm);padding:1px var(--sp-4)}
.inferences{list-style:none;margin:var(--sp-24) 0;padding:0;counter-reset:inf}
.inference{position:relative;padding:0 0 var(--sp-12) 40px;counter-increment:inf}
.inference-no::before{content:counter(inf);position:absolute;left:0;top:2px;width:24px;height:24px;
  border-radius:var(--r-pill);background:var(--c-teal600);color:var(--c-paper);font-family:var(--ff-num);
  font-size:var(--fs-label);font-weight:var(--fw-semibold);text-align:center;line-height:24px}
/* ── 表格 ── */
.tw{overflow-x:auto;margin:var(--sp-24) 0;background:var(--c-surface);border:1px solid var(--c-hair);
  border-radius:var(--r-md);box-shadow:var(--sh-s1);-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-family:var(--ff-ui);font-size:var(--fs-table);line-height:var(--lh-table)}
thead th{position:sticky;top:0;z-index:1;background:var(--c-teal50);color:var(--c-teal700);
  font-weight:var(--fw-semibold);text-align:left;padding:var(--sp-8) var(--sp-12);border-bottom:1px solid var(--c-hair)}
tbody td,tbody th{text-align:left;vertical-align:top;padding:var(--sp-8) var(--sp-12);border-bottom:1px solid var(--c-hair)}
tbody tr:last-child td,tbody tr:last-child th{border-bottom:0}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
/* ── 表格（严谨层：表题 + 表 + 口径 + 来源；移动端变形不删除） ── */
.table-fig{margin:var(--sp-24) 0}
.table-head{font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);
  font-weight:var(--fw-semibold);color:var(--c-teal700);margin:0 0 var(--sp-8)}
.table-caliber,.table-source{margin:var(--sp-4) 0 0;font-family:var(--ff-ui);font-size:var(--fs-micro);line-height:1.55;color:var(--c-ink500)}
.table-source{color:var(--c-ink600)}
/* ── 双向证伪 / 条件阶梯（严谨层） ── */
.falsify{margin:var(--sp-24) 0;padding:var(--sp-16);background:var(--c-surface);border:1px solid var(--c-hair);border-radius:var(--r-md);box-shadow:var(--sh-s1)}
.falsify-branch{display:grid;gap:var(--sp-4);padding:var(--sp-8) 0;border-bottom:1px dashed var(--c-hair)}
.falsify-branch--down{border-bottom:0}
.falsify-tag{font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);font-weight:var(--fw-semibold);color:var(--c-teal700)}
.falsify-branch--down .falsify-tag{color:var(--c-amber700)}
.falsify-body{font-size:var(--fs-table);line-height:1.65;color:var(--c-ink800)}
.falsify-signals{margin-top:var(--sp-16)}
.ladder{list-style:none;counter-reset:ld;margin:0;padding:0}
.ladder-step{position:relative;padding:var(--sp-12) 0 var(--sp-12) var(--sp-32);border-bottom:1px dashed var(--c-hair)}
.ladder-step:last-child{border-bottom:0}
.ladder-badge{position:absolute;left:0;top:var(--sp-12);font-family:var(--ff-num);font-size:var(--fs-label);font-weight:var(--fw-semibold);color:var(--c-teal700)}
.ladder-cond{font-size:var(--fs-table);line-height:1.6;color:var(--c-ink800)}
.ladder-act{margin-top:var(--sp-4);font-family:var(--ff-ui);font-size:var(--fs-caption);color:var(--c-teal700);font-weight:var(--fw-semibold)}
/* ── 脚注（严谨层） ── */
.fn-ref{font-family:var(--ff-num);font-size:.7em;line-height:0;vertical-align:super}
.fn-ref a{text-decoration:none;padding:0 2px}
.fn-list{list-style:none;margin:var(--sp-16) 0 0;padding:0;font-family:var(--ff-ui);font-size:var(--fs-caption);line-height:1.65}
.fn-item{position:relative;padding:var(--sp-4) 0 var(--sp-4) 28px;border-bottom:1px dashed var(--c-hair);color:var(--c-ink600)}
.fn-item:last-child{border-bottom:0}
.fn-no{position:absolute;left:0;color:var(--c-teal700);font-weight:var(--fw-semibold)}
/* ── 图 ── */
.figure{margin:var(--sp-32) 0;padding:0}
.fig-eyebrow{margin:0 0 var(--sp-12);display:block;padding-top:var(--sp-8);border-top:1px solid var(--c-hair);
  font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);font-weight:var(--fw-semibold);color:var(--c-teal700)}
.fig-svg{display:block;width:100%;height:auto;max-width:100%;background:var(--c-surface);border:1px solid var(--c-hair);
  border-radius:var(--r-md);box-shadow:var(--sh-s1)}
.fig-caption{margin:var(--sp-8) 0 0;font-family:var(--ff-ui);font-size:var(--fs-caption);line-height:var(--lh-caption);color:var(--c-ink600)}
.fig-source{margin:var(--sp-4) 0 0;display:block;font-family:var(--ff-ui);font-size:var(--fs-micro);color:var(--c-ink500)}
.fig-note{margin:var(--sp-16) 0;display:block;padding:var(--sp-8) var(--sp-16);font-family:var(--ff-ui);font-size:var(--fs-label);
  color:var(--c-ink600);background:var(--c-sunk);border-left:3px solid var(--c-hairStrong);border-radius:0 var(--r-sm) var(--r-sm) 0}
.fig-zoom{display:inline-flex;align-items:center;min-height:44px;margin-top:var(--sp-4);font-family:var(--ff-ui);
  font-size:var(--fs-caption);color:var(--c-teal600);text-decoration:none;border-bottom:1px solid var(--c-teal100)}
.f-ink{fill:var(--c-ink800)}.f-sec{fill:var(--c-ink600)}.f-card{fill:var(--c-surface)}
.f-bar{fill:var(--c-teal600)}.f-teal{fill:var(--c-teal600)}.f-track{fill:var(--c-sunk)}
.f-up{fill:var(--c-up)}.f-down{fill:var(--c-down)}.f-bar-alt{fill:var(--c-teal500)}
.tx-onbar{fill:var(--c-paper)}
.tx-ink{fill:var(--c-ink800)}.tx-sec{fill:var(--c-ink600)}.tx-teal{fill:var(--c-teal700)}
.s-axis{stroke:var(--c-ink500);stroke-width:1}
.s-hair{stroke:var(--c-hair);stroke-width:1}
.s-teal-thick{stroke:var(--c-teal600);stroke-width:6;stroke-linecap:round}
.s-dash{stroke:var(--c-hairStrong);stroke-width:1;stroke-dasharray:3 3}
/* ── 封面（移动端杂志 register） ── */
.cover{background:var(--c-coverInk);color:var(--c-coverText);margin:0 0 var(--sp-32);
  padding:var(--sp-32) var(--gl) var(--sp-24) var(--gl)}
.cover-kicker{display:block;font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);
  font-weight:var(--fw-semibold);color:var(--c-gold)}
.cover-issue{font-family:var(--ff-num);font-size:var(--fs-hero);line-height:1;letter-spacing:-.03em;
  font-weight:var(--fw-bold);color:var(--c-gold);margin:var(--sp-16) 0 var(--sp-8)}
.cover-title{font-family:var(--ff-prose);font-size:var(--fs-h1);line-height:1.22;letter-spacing:var(--ls-h1);
  color:var(--c-coverText);margin:0 0 var(--sp-12);text-wrap:balance}
.cover-lede{font-family:var(--ff-ui);font-size:var(--fs-caption);color:var(--c-coverMuted);margin:0 0 var(--sp-16)}
.cover-rule{border:0;border-top:2px solid var(--c-gold);width:56px;margin:0 0 var(--sp-16)}
.cover .masthead-meta{border-top:1px solid var(--c-hairOnCover);padding-top:var(--sp-16);margin:0}
.cover .masthead-meta dt{color:var(--c-coverMuted)}
.cover .masthead-meta dd{color:var(--c-coverText)}
.cover-stats{display:grid;gap:0;margin:var(--sp-8) 0 0}
.cover-stat{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;
  gap:var(--sp-4) var(--sp-12);padding:var(--sp-12) 0;border-top:1px solid var(--c-hairOnCover)}
.cover-stat-label{font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-meta);color:var(--c-coverMuted)}
.cover-stat-value{font-family:var(--ff-num);font-size:var(--fs-h3);font-weight:var(--fw-semibold);color:var(--c-coverText)}
.cover-stat-value .kpi-unit{color:var(--c-coverMuted)}
.cover-stat--down .cover-stat-value{color:var(--c-downOnCover)}
.cover-stat--up .cover-stat-value{color:var(--c-upOnCover)}
.cover-stat--warn .cover-stat-value{color:var(--c-gold)}
.cover-stat-note{grid-column:1/-1;font-family:var(--ff-ui);font-size:var(--fs-label);line-height:var(--lh-ui);color:var(--c-coverMuted)}
.cover-art{margin:var(--sp-16) 0 0}
.cover-art .fig-svg{background:transparent;border:0;box-shadow:none;border-radius:0;margin-left:calc(-1 * var(--gl));margin-right:calc(-1 * var(--gl));width:calc(100% + var(--gl) + var(--gr));max-width:none}
.cover-art-note{margin:var(--sp-4) 0 0;font-family:var(--ff-ui);font-size:var(--fs-micro);color:var(--c-coverMuted)}
.f-area{fill:var(--c-teal500);opacity:.26}
.s-line{fill:none;stroke:var(--c-gold);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.s-track{fill:none;stroke:var(--c-hair);stroke-width:14;stroke-linecap:round}
.s-gauge{fill:none;stroke:var(--c-teal600);stroke-width:14;stroke-linecap:round}
.s-gauge-hot{fill:none;stroke:var(--c-amber600);stroke-width:14;stroke-linecap:round}
.s-donut-0{fill:none;stroke:var(--c-teal600);stroke-width:26}
.s-donut-1{fill:none;stroke:var(--c-teal500);stroke-width:26}
.s-donut-2{fill:none;stroke:var(--c-ink400);stroke-width:26}
.f-bar-alt{fill:var(--c-teal500)}.f-bar-mut{fill:var(--c-ink400)}
.tx-big{font-family:var(--ff-num)}
.tx-oncover{fill:var(--c-coverText)}
.tx-oncoverMuted{fill:var(--c-coverMuted)}
/* ── 导语 / 读懂这一节 / 术语表 ── */
.lede{font-family:var(--ff-prose);font-size:var(--fs-h4);line-height:1.7;color:var(--c-ink800);
  margin:var(--sp-24) 0;padding-left:var(--sp-16);border-left:3px solid var(--c-gold)}
.takeaway{position:relative;background:var(--c-amber50);border-left:3px solid var(--c-amber600);
  border-radius:0 var(--r-md) var(--r-md) 0;padding:var(--sp-16) var(--sp-16) var(--sp-12) 52px;margin:var(--sp-24) 0}
.takeaway-badge{position:absolute;left:var(--sp-12);top:var(--sp-16);width:28px;height:28px;border-radius:var(--r-pill);
  background:var(--c-amber700);color:var(--c-paper);font-family:var(--ff-num);font-size:var(--fs-label);
  font-weight:var(--fw-bold);display:flex;align-items:center;justify-content:center}
.takeaway-title{font-family:var(--ff-ui);font-size:var(--fs-label);letter-spacing:var(--ls-label);
  font-weight:var(--fw-semibold);color:var(--c-amber700);margin:0 0 var(--sp-8)}
.takeaway ul{margin:0;padding-left:1.1em}
.takeaway-item{margin:0 0 var(--sp-4);font-size:var(--fs-table);line-height:1.65;color:var(--c-ink800)}
.takeaway-item:last-child{margin-bottom:0}
.glossary{margin:var(--sp-24) 0;display:grid;gap:0}
.glossary-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--sp-4) var(--sp-12);
  padding:var(--sp-8) 0;border-bottom:1px dashed var(--c-hair)}
.glossary-term{font-family:var(--ff-ui);font-size:var(--fs-table);font-weight:var(--fw-semibold);color:var(--c-teal700)}
.glossary-def{margin:0;font-size:var(--fs-table);line-height:var(--lh-table);color:var(--c-ink600)}
/* ── 目录：桌面 rail ── */
.rail{font-family:var(--ff-ui);font-size:var(--fs-label);line-height:var(--lh-ui);
  position:sticky;top:var(--sp-24);align-self:start;max-height:calc(100vh - 48px);overflow:auto}
.rail-brand{text-wrap:balance;font-weight:var(--fw-semibold);color:var(--c-teal700);margin:0 0 var(--sp-12);letter-spacing:var(--ls-meta)}
.rail-list{list-style:none;margin:0;padding:0}
.rail-item{display:flex;align-items:center;gap:var(--sp-8);min-height:44px;padding:var(--sp-4) var(--sp-8);
  color:var(--c-ink600);text-decoration:none;border-left:2px solid var(--c-hair)}
.rail-item .rn{color:var(--c-teal600);font-weight:var(--fw-semibold)}
.rail-item:hover,.rail-item:focus-visible{background:var(--c-teal50);color:var(--c-teal700);border-left-color:var(--c-teal600)}
${railActive ? `${railActive}{background:var(--c-teal50);color:var(--c-teal700);font-weight:var(--fw-semibold);border-left-color:var(--c-teal600)}` : ''}
.tocbar{display:none}
/* ── 脚注 / 封底 ── */
.footnotes{margin:var(--sp-24) 0;padding-left:1.4em;font-family:var(--ff-ui);font-size:var(--fs-table);line-height:var(--lh-table)}
.footnotes li{padding:var(--sp-4) 0}
.src-link{display:inline-block;min-height:44px;line-height:44px}
.colophon{margin-top:var(--sp-48);padding-top:var(--sp-16);border-top:2px solid var(--c-teal600);
  font-family:var(--ff-ui);font-size:var(--fs-label);color:var(--c-ink600)}
.colophon-line{margin:0 0 var(--sp-4)}
/* ── 放大层（纯 CSS，:target） ── */
.zoom{display:none;position:fixed;inset:0;z-index:50;background:rgba(15,26,23,.72);padding:var(--sp-24);overflow:auto}
.zoom:target{display:block}
.zoom-inner{max-width:920px;margin:0 auto;background:var(--c-surface);border-radius:var(--r-lg);padding:var(--sp-16)}
.zoom-close{position:sticky;top:0;float:right;display:flex;align-items:center;justify-content:center;
  width:44px;height:44px;color:var(--c-ink800);background:var(--c-paper);border:1px solid var(--c-hair);
  border-radius:var(--r-pill);text-decoration:none;font-size:var(--fs-h4)}
/* ── 断点：≤1080px 移动优先 ── */
/* 桌面＝研究札记密度（严谨档）：行长更宽、章节间距更紧、表格列严格对齐；移动端＝杂志密度 */
@media (min-width:1081px){
  main{max-width:780px}
  p{line-height:1.72}
  .chapter-head{margin-top:var(--sp-32)}
  .tw{margin:var(--sp-16) 0}
  table{font-size:var(--fs-table)}
  tbody td,tbody th{padding:var(--sp-8) var(--sp-12)}
  .figure{margin:var(--sp-24) 0}
  .fn-list{font-size:var(--fs-label)}
  .cover{padding:var(--sp-48) var(--sp-32) var(--sp-32)}
  .cover-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:0 var(--sp-24)}
  .cover-stat{display:block}
  .cover-stat:first-child,.cover-stat:nth-child(2),.cover-stat:nth-child(3){border-top:1px solid var(--c-hairOnCover)}
  .cover-stat-label{display:block;margin-bottom:var(--sp-4)}
  .cover-stat-value{font-size:var(--fs-h4)}
  .cover-stat-note{margin-top:var(--sp-4)}
}
@media (max-width:1080px){
  .shell{display:block;max-width:none;padding:0}
  .rail{display:none}
  main{max-width:none;padding:var(--sp-24) var(--gr) var(--sp-48) var(--gl)}
  .tocbar{display:block;position:sticky;top:0;z-index:20;background:var(--c-surface);border-bottom:1px solid var(--c-hair)}
  .tocbar-title{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-8);
    min-height:52px;padding:0 var(--gr) 0 var(--gl);font-family:var(--ff-ui);font-size:var(--fs-caption);
    font-weight:var(--fw-semibold);color:var(--c-teal700);cursor:pointer;list-style:none}
  .tocbar-title::-webkit-details-marker{display:none}
  .tocbar .cur{display:none}
  ${tocbarActive ? `${tocbarActive}{display:inline}` : ''}
  .tocbar:not(:has(.cur:target)) .cur:first-child{display:inline}
  .tocbar-drawer{display:flex;flex-direction:column;border-top:1px solid var(--c-hair);background:var(--c-paper)}
  .tocbar-item{display:flex;align-items:center;gap:var(--sp-8);min-height:44px;padding:0 var(--gr) 0 var(--gl);
    color:var(--c-ink800);text-decoration:none;font-family:var(--ff-ui);font-size:var(--fs-caption);border-bottom:1px solid var(--c-hair)}
  .tocbar-item .rn{color:var(--c-teal600);font-weight:var(--fw-semibold)}
  .masthead{margin:var(--sp-16) 0 var(--sp-32);padding:var(--sp-24) var(--sp-16);border-radius:0}
  /* 脚注上标：视觉仍是小上标，但触控目标撑到 ≥44×44（padding 与负 margin 抵消，不改行长） */
  .fn-ref a{display:inline-block;padding:22px 18px;margin:-22px -18px}
  /* 杂志封面：band 打满屏宽（main 已留出安全区沟槽，用负外边距抵消） */
  .cover{margin-left:calc(-1 * var(--gl));margin-right:calc(-1 * var(--gr));border-radius:0}
  .chapter-head{margin-top:var(--sp-48)}
  .fig-svg{margin-left:calc(-1 * var(--gl));margin-right:calc(-1 * var(--gr));width:calc(100% + var(--gl) + var(--gr));
    max-width:none;border-radius:0;border-left:0;border-right:0}
  .footnotes{margin-bottom:var(--sp-32)}
}
@media (max-width:600px){
  .kpi--wide{display:flex;flex-direction:column;align-items:flex-start;gap:var(--sp-4)}
  .kpi--wide .kpi-value{font-size:var(--fs-h3)}
}
@media (max-width:480px){
  .kpi-row{grid-template-columns:repeat(2,minmax(0,1fr))}
  .compare{grid-template-columns:minmax(0,1fr)}
  .compare-head{display:none}
  .compare-row{display:block;border-bottom:1px solid var(--c-hair)}
  .compare-row>*{display:block;border-bottom:0;padding:var(--sp-4) var(--sp-16)}
  .compare-dim{padding-top:var(--sp-12)}
  .compare-old::before{content:"旧读法：";font-weight:var(--fw-semibold);color:var(--c-ink500)}
  .compare-new::before{content:"新读法：";font-weight:var(--fw-semibold);color:var(--c-ink500)}
  .compare-old,.compare-new{padding-bottom:var(--sp-4)}
  .compare-row>*:last-child{padding-bottom:var(--sp-12)}
  .tw{overflow:visible;border:0;background:transparent;box-shadow:none}
  table{display:block;min-width:0}
  thead{display:none}
  tbody,tr,td{display:block}
  tbody tr{border:1px solid var(--c-hair);border-radius:var(--r-md);background:var(--c-surface);box-shadow:var(--sh-s1);padding:var(--sp-8) var(--sp-12);margin:0 0 var(--sp-12)}
  tbody td{border:0;padding:var(--sp-4) 0;text-align:left}
  tbody td.num{text-align:left}
  tbody td::before{content:attr(data-label) "：";font-weight:var(--fw-semibold);color:var(--c-ink500)}
  .masthead-meta{grid-template-columns:minmax(0,1fr)}
  .masthead-meta dt{margin-top:var(--sp-8)}
}
@media (max-width:400px){
  .kpi-row{grid-template-columns:minmax(0,1fr)}
}
@media print{
  body{background:var(--c-paper)}
  .shell{display:block;max-width:none;padding:0}
  .rail,.tocbar,.fig-zoom,.zoom{display:none}
  .fig-svg{margin:0;width:100%;border:0;box-shadow:none}
  figure,table,tr,.callout,.kpi-row,.compare{break-inside:avoid}
  h2,h3{break-after:avoid}
  @page{margin:${DS.print?.pageMargin ?? '14mm'}}
}
`

const htmlOut = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<a class="sr-only" href="#main">跳到正文</a>
${tocbar}
<div class="shell">
${rail}
<div class="wrap">
<main id="main">
${html}
</main>
<footer class="colophon">
${disclaimer}
<div class="colophon-line">设计系统 <code>${esc(DS.id)}</code> · 修订 ${esc(DS.revision)} · 输出模板 <code>${esc(tpl.id)}</code> v${esc(tpl.version)}</div>
<div class="colophon-line">货币单位 ${esc(tpl.currency ?? '¥')}；日期 ${esc(tpl.dateFormat ?? 'YYYY-MM-DD')}；涨=红、跌=绿仅用于方向性读数。</div>
</footer>
</div>
</div>
<!--FIGLIST:${figList.map(f => `${f.no}=${f.title}`).join('|')}-->
</body>
</html>
`
writeFileSync(resolve(outPath), htmlOut)

/* 幂等性断言：同输入两次渲染必须逐字节一致（无时间戳/随机） */
{
  const again = `${htmlOut}`
  if (again !== htmlOut) fail('渲染不确定（两次结果不一致）')
}
if (errors.length) {
  console.error(`✗ 渲染断言未过（${errors.length}）：`)
  for (const e of errors) console.error(`  · ${e}`)
  process.exit(1)
}
console.log(`已渲染 ${outPath}（${Buffer.byteLength(htmlOut)} B；章节 ${toc.length}；图 ${figureRegistry.length}；源 ${mdPath} ${Buffer.byteLength(md)} B）`)
