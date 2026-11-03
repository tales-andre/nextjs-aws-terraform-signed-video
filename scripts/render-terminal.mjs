// Renders a captured command output (text file) as a terminal-style PNG for the README.
// Usage: PW_CHANNEL=msedge node scripts/render-terminal.mjs <output.txt> <out.png> "<command shown on top>"
import { readFileSync } from "node:fs";
import { launchBrowser } from "./browser.mjs";

const [input, out, command] = process.argv.slice(2);
// Strip ANSI colour codes and Windows line endings from the captured output.
const text = readFileSync(input, "utf8").replace(/\u001b\[[0-9;]*m/g, "").replace(/\r/g, "").trimEnd();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const colored = esc(text)
  .split("\n")
  .map((line) => {
    if (/\b(pass|passed|ok|Success!|✓)\b/.test(line) && !/\b(fail|failed)\b/i.test(line.replace(/0 failed/, ""))) {
      return `<span style="color:#86efac">${line}</span>`;
    }
    if (/\b(fail|failed|Error)\b/.test(line) && !/0 failed/.test(line)) return `<span style="color:#fca5a5">${line}</span>`;
    return line;
  })
  .join("\n");

const html = `<!doctype html><html><body style="margin:0;background:#0f172a">
<div style="padding:22px 26px;font:15px/1.5 Consolas,'Cascadia Mono',monospace;color:#e2e8f0;white-space:pre">
<span style="color:#7dd3fc">$ ${esc(command)}</span>
${colored}
</div></body></html>`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1100, height: 200 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
