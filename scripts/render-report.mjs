#!/usr/bin/env node
/**
 * 报告渲染器：markdown → 自包含 HTML5（实现包里声明的渲染规格）。
 *
 * 规格不在本文件里，在包里：`output-templates/*.json` 的 `rendering` / `media` / `renderModes`：
 *   · 浅色、衬线、学术排版；涨=红、跌=绿；货币 ¥；日期 YYYY-MM-DD；文末固定「不构成投资建议」
 *   · `renderModes.html.mobile`：375 主视口、正文 ≥17px、rail→顶部粘性目录条、
 *     宽表卡片堆叠或受控横滚、触控目标 ≥44px、安全区、打印样式
 * 本渲染器只负责执行规格；改版式请改模板的 `rendering`，不要改这里。
 *
 * 为什么自包含：审核要在 file:// 下用无头浏览器逐视口跑（render-overflow / mobile-readability 门禁），
 * 任何外链字体/样式都会让读数依赖网络。
 *
 * 用法：
 *   node scripts/render-report.mjs --md <final.md> --template <output-templates/x.json> --out <index.html> [--title "..."]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARGV = process.argv.slice(2)
const val = f => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : null }
const mdPath = val('--md'), tplPath = val('--template'), outPath = val('--out')
if (!mdPath || !tplPath || !outPath) {
  console.error('用法：node scripts/render-report.mjs --md <final.md> --template <tpl.json> --out <index.html> [--title "..."]')
  process.exit(2)
}
const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
const tpl = JSON.parse(readText(tplPath))
const spec = tpl.rendering ?? {}
const mobileSpec = tpl.renderModes?.html?.mobile ?? {}
const title = val('--title') ?? tpl.name ?? '报告'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// 行内元素：粗体、行内代码、链接。涨跌着色按规格（涨=红、跌=绿），只对带符号的百分比/数字生效。
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
  .replace(/(^|[\s（(])\+(\d+(?:\.\d+)?\s*(?:%|pp|bp)?)/g, '$1<span class="up">+$2</span>')
  .replace(/(^|[\s（(])[−-](\d+(?:\.\d+)?\s*(?:%|pp|bp)?)/g, '$1<span class="down">−$2</span>')

function renderMd(md) {
  const lines = md.split(/\r?\n/)
  const out = []
  const toc = []                      // {id, text} —— 只为 h2 建目录（保持目录条短）
  let i = 0, hid = 0
  const flushPara = buf => { if (buf.length) { out.push(`<p>${inline(buf.join(' '))}</p>`); buf.length = 0 } }
  const para = []
  while (i < lines.length) {
    const line = lines[i]
    // 表格（窄屏卡片堆叠需要 data-label，故逐格带上表头文本）
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      flushPara(para)
      const head = line.split('|').slice(1, -1).map(s => s.trim())
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++ }
      out.push('<div class="tw"><table><thead><tr>' + head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map((c, k) => `<td data-label="${esc(head[k] ?? '')}">${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (/^###\s+/.test(line)) { flushPara(para); out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); i++; continue }
    if (/^##\s+/.test(line)) {
      flushPara(para)
      const text = line.replace(/^##\s+/, ''); const id = `s${++hid}`
      toc.push({ id, text })
      out.push(`<h2 id="${id}">${inline(text)}</h2>`); i++; continue
    }
    if (/^#\s+/.test(line)) { flushPara(para); out.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`); i++; continue }
    if (/^\s*>\s?/.test(line)) { flushPara(para); const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue }
    if (/^\s*[-*]\s+/.test(line)) { flushPara(para); const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++ }
      out.push('<ul>' + items.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>'); continue }
    if (/^\s*\d+[.、]\s+/.test(line)) { flushPara(para); const items = []
      while (i < lines.length && /^\s*\d+[.、]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.、]\s+/, '')); i++ }
      out.push('<ol>' + items.map(x => `<li>${inline(x)}</li>`).join('') + '</ol>'); continue }
    if (/^\s*---+\s*$/.test(line)) { flushPara(para); out.push('<hr>'); i++; continue }
    if (/^\s*$/.test(line)) { flushPara(para); i++; continue }
    para.push(line.trim()); i++
  }
  flushPara(para)
  return { body: out.join('\n'), toc }
}

// 版式：浅色 + 衬线 + 学术；对比度按 WCAG AA 选色（正文 #1b1b1a 于 #fff ≈ 16:1；红/绿用深色而非亮色）
// 移动端按 renderModes.html.mobile 落地：桌面 rail → 窄屏顶部粘性目录条；宽表窄屏卡片堆叠；触控 ≥44px；打印样式。
const CSS = `
:root{--ink:#1b1b1a;--ink2:#3d3d3b;--line:#dcdcd8;--bg:#fbfbf9;--paper:#fff;--up:#B3261E;--down:#0F6B3C;--accent:#176C6B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.85 "Songti SC","Noto Serif SC",Georgia,serif;
     font-variant-numeric:tabular-nums;overflow-wrap:anywhere;-webkit-text-size-adjust:100%}
.layout{display:grid;grid-template-columns:212px minmax(0,1fr);gap:30px;max-width:1120px;margin:0 auto;
        padding:26px 22px 64px;background:var(--paper);padding-left:max(22px,env(safe-area-inset-left));
        padding-right:max(22px,env(safe-area-inset-right))}
.wrap{min-width:0;max-width:820px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
/* 目录：桌面为 rail（左侧粘性），窄屏收起为顶部粘性目录条 */
.toc{position:sticky;top:18px;align-self:start;max-height:calc(100vh - 36px);overflow:auto;font-size:13.5px}
.toc-title{font-size:12px;letter-spacing:.1em;color:var(--ink2);margin:0 0 8px}
.toc a{display:flex;align-items:center;min-height:44px;min-width:44px;padding:4px 10px;color:var(--ink2);
       text-decoration:none;border-left:2px solid transparent;line-height:1.5}
.toc a:hover,.toc a:focus-visible{border-left-color:var(--accent);color:var(--ink);background:#f6f7f6}
h1{font-size:26px;line-height:1.4;margin:8px 0 20px}
h2{font-size:21px;line-height:1.45;margin:34px 0 12px;padding-top:14px;border-top:1px solid var(--line);scroll-margin-top:64px}
h3{font-size:18px;margin:24px 0 8px;color:var(--ink2)}
p{margin:10px 0}
a{color:var(--accent);overflow-wrap:anywhere}
code{font:14px/1.6 ui-monospace,Menlo,monospace;background:#f2f2ef;padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.tw{overflow-x:auto;max-width:100%;margin:14px 0;-webkit-overflow-scrolling:touch}  /* 宽表容器内横滚：不算页面溢出（见 render-overflow 判据） */
table{border-collapse:collapse;width:100%;min-width:560px;font-size:15px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:#f4f4f1;font-weight:600}
blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid var(--accent);background:#f6f7f6;color:var(--ink2)}
.up{color:var(--up)}.down{color:var(--down)}
hr{border:0;border-top:1px solid var(--line);margin:26px 0}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--line);color:var(--ink2);font-size:14px}
@media (max-width:1080px){
  .layout{display:block;max-width:none;padding:0}
  .toc{position:sticky;top:0;z-index:10;display:flex;gap:2px;overflow-x:auto;max-height:none;
       background:var(--paper);border-bottom:1px solid var(--line);padding:0 10px;font-size:13px}
  .toc-title{display:none}
  .toc a{white-space:nowrap;border-left:0;border-bottom:2px solid transparent;padding:0 12px}
  .wrap{max-width:none;padding:18px 16px 56px}
  footer{margin:30px 16px 0;padding-bottom:max(20px,env(safe-area-inset-bottom))}
}
@media (max-width:480px){
  .tw{overflow:visible}
  table{display:block;min-width:0;font-size:15px}
  thead{display:none}                                  /* 卡片堆叠：表头以 data-label 前缀逐格回填 */
  tbody,tr,td{display:block}
  tr{border:1px solid var(--line);padding:6px 10px;margin:0 0 10px;background:#fdfdfc}
  td{border:0;padding:4px 0}
  td::before{content:attr(data-label) "：";font-weight:600;color:var(--ink2);margin-right:2px}
}
@media print{
  body{background:#fff}
  .layout{display:block;max-width:none;padding:0}
  .toc{display:none}
  .tw{overflow:visible}
  table{min-width:0}
  tr,blockquote{break-inside:avoid}
  h2{break-after:avoid}
}
`.trim()

const md = readText(mdPath)
const { body, toc } = renderMd(md)
const nav = toc.length
  ? `<nav class="toc" aria-label="目录"><p class="toc-title">目录</p>${toc.map(t => `<a href="#${t.id}">${esc(t.text)}</a>`).join('')}</nav>`
  : '<nav class="toc" aria-label="目录"></nav>'
const disclaimer = /不构成投资建议/.test(md) ? '' : '<p>本报告为方法演示，<strong>不构成投资建议</strong>。</p>'
const mobileNote = mobileSpec.bodyFontMinPx ? `；移动端按 renderModes.html.mobile 执行（正文 ≥${mobileSpec.bodyFontMinPx['375']}px@375，窄屏卡片堆叠，触控 ≥${mobileSpec.tapTargetMinPx}px）` : ''
const html = `<!DOCTYPE html>
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
<div class="layout">
${nav}
<div class="wrap">
<main id="main">
${body}
</main>
<footer>${disclaimer}<p>渲染规格来自 <code>${tpl.id}</code> 的 rendering 声明：${esc(spec.notes ?? '')}${mobileNote}</p><p>货币单位 ¥；日期 YYYY-MM-DD；涨=红、跌=绿。</p></footer>
</div>
</div>
</body>
</html>
`
writeFileSync(resolve(outPath), html)
console.log(`已渲染 ${outPath}（${Buffer.byteLength(html)} B；目录 ${toc.length} 项；源 ${mdPath} ${Buffer.byteLength(md)} B）`)
