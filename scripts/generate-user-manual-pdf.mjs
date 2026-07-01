/**
 * Build docs/USER_MANUAL.pdf from docs/USER_MANUAL.md via Puppeteer.
 * Run: node scripts/generate-user-manual-pdf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mdPath = path.join(root, "docs", "USER_MANUAL.md");
const pdfPath = path.join(root, "docs", "USER_MANUAL.pdf");
const publicPdfPath = path.join(root, "public", "USER_MANUAL.pdf");
const docsDir = path.join(root, "docs");

function imageToDataUrl(relativePath) {
  const abs = path.join(docsDir, relativePath);
  if (!fs.existsSync(abs)) return null;
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "jpeg" : ext;
  const b64 = fs.readFileSync(abs).toString("base64");
  return `data:image/${mime};base64,${b64}`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (!buf.length) return;
    const text = buf.join(" ").trim();
    if (!text) return;
    out.push(`<p>${inline(text)}</p>`);
  };

  const inline = (text) => {
    let s = escapeHtml(text);
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  };

  let paraBuf = [];

  while (i < lines.length) {
    const line = lines[i];

    if (line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)) {
      flushParagraph(paraBuf);
      paraBuf = [];
      const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const alt = match[1];
      const src = match[2];
      const dataUrl = imageToDataUrl(src);
      if (dataUrl) {
        out.push(
          `<figure class="screenshot"><img src="${dataUrl}" alt="${escapeHtml(alt)}"/><figcaption>${escapeHtml(alt)}</figcaption></figure>`,
        );
      }
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph(paraBuf);
      paraBuf = [];
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (line.match(/^\|.+\|$/)) {
      flushParagraph(paraBuf);
      paraBuf = [];
      const tableRows = [];
      while (i < lines.length && lines[i].match(/^\|.+\|$/)) {
        tableRows.push(lines[i]);
        i++;
      }
      const rows = tableRows
        .filter((r) => !/^\|[\s\-:|]+\|$/.test(r))
        .map((r) =>
          r
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim()),
        );
      if (rows.length) {
        const [head, ...body] = rows;
        out.push("<table><thead><tr>");
        for (const c of head) out.push(`<th>${inline(c)}</th>`);
        out.push("</tr></thead><tbody>");
        for (const row of body) {
          out.push("<tr>");
          for (const c of row) out.push(`<td>${inline(c)}</td>`);
          out.push("</tr>");
        }
        out.push("</tbody></table>");
      }
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph(paraBuf);
      paraBuf = [];
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph(paraBuf);
      paraBuf = [];
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph(paraBuf);
      paraBuf = [];
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      i++;
      continue;
    }

    if (line.match(/^- \[[ x]\] /)) {
      flushParagraph(paraBuf);
      paraBuf = [];
      out.push('<ul class="checklist">');
      while (i < lines.length && lines[i].match(/^- \[[ x]\] /)) {
        const checked = lines[i][3] === "x";
        const label = lines[i].slice(6).trim();
        out.push(
          `<li class="${checked ? "done" : ""}"><input type="checkbox" disabled ${checked ? "checked" : ""}/> ${inline(label)}</li>`,
        );
        i++;
      }
      out.push("</ul>");
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph(paraBuf);
      paraBuf = [];
      out.push("<ul>");
      while (i < lines.length && lines[i].startsWith("- ")) {
        out.push(`<li>${inline(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push("</ul>");
      continue;
    }

    if (/^\d+\. /.test(line)) {
      flushParagraph(paraBuf);
      paraBuf = [];
      out.push("<ol>");
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^\d+\. /, ""))}</li>`);
        i++;
      }
      out.push("</ol>");
      continue;
    }

    if (line.trim() === "---") {
      flushParagraph(paraBuf);
      paraBuf = [];
      out.push("<hr/>");
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(paraBuf);
      paraBuf = [];
      i++;
      continue;
    }

    paraBuf.push(line);
    i++;
  }
  flushParagraph(paraBuf);
  return out.join("\n");
}

const md = fs.readFileSync(mdPath, "utf8");
const body = markdownToHtml(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>NFT Layer Mixer — User Guide</title>
  <style>
    @page { margin: 18mm 16mm; size: letter; }
    * { box-sizing: border-box; }
    body {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 20pt;
      color: #2e1065;
      border-bottom: 3px solid #8b5cf6;
      padding-bottom: 8px;
      margin-top: 0;
    }
    h2 {
      font-size: 13pt;
      color: #2e1065;
      margin-top: 1.4em;
      page-break-after: avoid;
    }
    h3 { font-size: 11pt; margin-top: 1em; page-break-after: avoid; }
    a { color: #7c3aed; }
    code, pre {
      font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
      font-size: 8.5pt;
    }
    pre {
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      border-radius: 4px;
      padding: 10px 12px;
      white-space: pre-wrap;
      word-break: break-word;
      page-break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #ede9fe; color: #2e1065; }
    tr:nth-child(even) td { background: #faf5ff; }
    ul, ol { margin: 0.4em 0; padding-left: 1.4em; }
    ul.checklist { list-style: none; padding-left: 0; }
    ul.checklist li { margin: 4px 0; }
    hr {
      border: none;
      border-top: 1px solid #ddd6fe;
      margin: 1.2em 0;
    }
    p { margin: 0.5em 0; }
    figure.screenshot {
      margin: 12px 0 16px;
      page-break-inside: avoid;
      text-align: center;
    }
    figure.screenshot img {
      max-width: 100%;
      border: 1px solid #ddd6fe;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(46, 16, 101, 0.08);
    }
    figure.screenshot figcaption {
      font-size: 9pt;
      color: #6b7280;
      margin-top: 6px;
    }
    .cover-note {
      background: #f5f3ff;
      border-left: 4px solid #8b5cf6;
      padding: 10px 14px;
      margin-bottom: 1em;
      font-size: 10pt;
    }
  </style>
</head>
<body>
  <div class="cover-note">
    <strong>NFT Layer Mixer</strong> — Art Generator &amp; Rarity Engine.
    App: <a href="https://nft-layer-mixer.vercel.app">nft-layer-mixer.vercel.app</a>
  </div>
  ${body}
</body>
</html>`;

const htmlPath = path.join(root, "docs", ".USER_MANUAL-print.html");
fs.writeFileSync(htmlPath, html);

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
await page.pdf({
  path: pdfPath,
  format: "Letter",
  printBackground: true,
  margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
});
await browser.close();
fs.unlinkSync(htmlPath);

fs.copyFileSync(pdfPath, publicPdfPath);
console.log(`Wrote ${pdfPath}`);
console.log(`Copied to ${publicPdfPath}`);
