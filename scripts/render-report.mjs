#!/usr/bin/env node
/**
 * 报告渲染器：markdown → 自包含 HTML5（实现包里声明的渲染规格）。
 *
 * 规格不在本文件里，在包里：`output-templates/*.json` 的 `rendering` / `media` / `renderModes`：
 *   · 浅色、衬线、学术排版；涨=红、跌=绿；货币 ¥；日期 YYYY-MM-DD；文末固定「不构成投资建议」
 * 本渲染器只负责执行规格；改版式请改模板的 `rendering`，不要改这里。
 *
 * 为什么自包含：审核要在 file:// 下用无头浏览器逐视口跑（render-overflow 门禁），
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
const theme = tpl.renderModes?.html ?? {}
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
  let i = 0
  const flushPara = buf => { if (buf.length) { out.push(`<p>${inline(buf.join(' '))}</p>`); buf.length = 0 } }
  const para = []
  while (i < lines.length) {
    const line = lines[i]
    // 表格
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      flushPara(para)
      const head = line.split('|').slice(1, -1).map(s => s.trim())
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++ }
      out.push('<div class="tw"><table><thead><tr>' + head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (/^###\s+/.test(line)) { flushPara(para); out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); i++; continue }
    if (/^##\s+/.test(line)) { flushPara(para); out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); i++; continue }
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
  return out.join('\n')
}

// 版式：浅色 + 衬线 + 学术；对比度按 WCAG AA 选色（正文 #222 于 #fff ≈ 15.9:1；红/绿用深色而非亮色）
const CSS = `
:root{--ink:#1b1b1a;--ink2:#3d3d3b;--line:#dcdcd8;--bg:#fbfbf9;--paper:#fff;--up:#B3261E;--down:#0F6B3C;--accent:#176C6B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.85 "Songti SC","Noto Serif SC",Georgia,serif;overflow-wrap:anywhere}
.wrap{max-width:900px;margin:0 auto;padding:32px 20px 64px;background:var(--paper);overflow-wrap:anywhere}
@media (max-width:420px){.wrap{padding:20px 12px 48px}}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
h1{font-size:26px;line-height:1.4;margin:8px 0 20px}
h2{font-size:21px;margin:34px 0 12px;padding-top:14px;border-top:2px solid var(--ink)}
h3{font-size:18px;margin:24px 0 8px;color:var(--ink2)}
p{margin:10px 0}
a{color:var(--accent)}
code{font:14px/1.6 ui-monospace,Menlo,monospace;background:#f2f2ef;padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
a{overflow-wrap:anywhere}
.tw{overflow-x:auto;max-width:100%;margin:14px 0}          /* 宽表在此容器内横滚：不算页面溢出（见 render-overflow 判据） */
table{border-collapse:collapse;width:100%;min-width:560px;font-size:15px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:#f4f4f1;font-weight:600}
blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid var(--accent);background:#f6f7f6;color:var(--ink2)}
.up{color:var(--up)}.down{color:var(--down)}
hr{border:0;border-top:1px solid var(--line);margin:26px 0}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--line);color:var(--ink2);font-size:14px}
`.trim()

const md = readText(mdPath)
const body = renderMd(md)
const disclaimer = /不构成投资建议/.test(md) ? '' : '<p>本报告为方法演示，<strong>不构成投资建议</strong>。</p>'
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<a class="sr-only" href="#main">跳到正文</a>
<div class="wrap">
<main id="main">
${body}
</main>
<footer>${disclaimer}<p>渲染规格来自 <code>${tpl.id}</code> 的 rendering 声明：${esc(spec.notes ?? '')}</p><p>货币单位 ¥；日期 YYYY-MM-DD；涨=红、跌=绿。</p></footer>
</div>
</body>
</html>
`
writeFileSync(resolve(outPath), html)
console.log(`已渲染 ${outPath}（${Buffer.byteLength(html)} B；源 ${mdPath} ${Buffer.byteLength(md)} B）`)
