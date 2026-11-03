// Records docs/demo.gif and the README screenshots from the real app running locally.
// Needs `npm run setup` and `npm run build` first. Starts its own app + edge on spare ports
// with an 8-second link lifetime, drives a headless browser, then stops them.
// Usage: PW_CHANNEL=msedge node scripts/record-demo.mjs
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import gifenc from "gifenc";
import { PNG } from "pngjs";
import { launchBrowser } from "./browser.mjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const APP = "http://localhost:3300";
const EDGE = "http://localhost:4301";
const TTL = 8;
const W = 1100;
const H = 900;

// ---------- servers ----------
const storage = ".local/record-storage";
rmSync(storage, { recursive: true, force: true });
mkdirSync(path.join(storage, "videos"), { recursive: true });
for (const f of readdirSync("storage/seed")) copyFileSync(path.join("storage/seed", f), path.join(storage, "videos", f));
const env = { ...process.env, STORAGE_DIR: storage, VIDEO_BASE_URL: EDGE, SIGNED_URL_TTL_SECONDS: String(TTL), NEXTAUTH_URL: APP, EDGE_PORT: "4301" };
const servers = [
  spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "edge/server.ts"], { env, stdio: "ignore" }),
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3300"], { env, stdio: "ignore" }),
];
const stopServers = () => servers.forEach((s) => s.kill());
process.on("exit", stopServers);

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`not up: ${url}`);
}
await waitFor(`${APP}/login`);
await waitFor(`${EDGE}/videos/x.webm`);

// ---------- browser + capture helpers ----------
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await context.newPage();
const frames = []; // { png: Buffer, delay: ms }

async function caption(p, text, tone = "info") {
  await p.evaluate(
    ({ text, tone }) => {
      let el = document.getElementById("__demo_caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__demo_caption";
        Object.assign(el.style, {
          position: "fixed", left: "0", right: "0", bottom: "0", padding: "16px 28px", zIndex: "99999",
          font: "600 24px Segoe UI, system-ui, sans-serif", color: "#fff", textAlign: "center",
        });
        document.body.appendChild(el);
      }
      el.style.background = tone === "bad" ? "rgba(153, 27, 27, 0.94)" : tone === "good" ? "rgba(22, 101, 52, 0.94)" : "rgba(20, 33, 61, 0.94)";
      el.textContent = text;
    },
    { text, tone },
  );
}

async function clearCaption(p) {
  await p.evaluate(() => document.getElementById("__demo_caption")?.remove());
}

async function snap(p, delay) {
  frames.push({ png: await p.screenshot(), delay });
}

async function hold(p, ms, every = 500) {
  for (let t = 0; t < ms; t += every) {
    await snap(p, every);
    await p.waitForTimeout(every);
  }
}

// A small page that shows a real HTTP response, styled like the app.
async function showResponse(p, url, status, body, title) {
  await p.setContent(`<!doctype html><html><body style="margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#f6f7fb;color:#14213d">
    <div style="background:#14213d;color:#fff;padding:14px 28px;font-weight:700;font-size:20px">Request to the video link (real response from the local edge)</div>
    <div style="padding:36px 40px">
      <div style="font-size:15px;color:#5b6577;margin-bottom:8px">GET</div>
      <div style="font:13px Consolas,monospace;background:#fff;border:1px solid #dfe3ea;border-radius:10px;padding:14px;word-break:break-all">${url.replace(/&/g, "&amp;")}</div>
      <div style="margin-top:28px;display:flex;align-items:center;gap:18px">
        <span style="background:${status === 200 ? "#166534" : "#991b1b"};color:#fff;font-weight:800;font-size:34px;padding:8px 22px;border-radius:10px">${status}</span>
        <span style="font-size:24px;font-weight:600">${title}</span>
      </div>
      <pre style="margin-top:22px;font:13px Consolas,monospace;background:#fff;border:1px solid #dfe3ea;border-radius:10px;padding:14px;white-space:pre-wrap">${body.replace(/</g, "&lt;")}</pre>
    </div></body></html>`);
}

// ---------- 1. logged out ----------
await page.goto(`${APP}/`);
await caption(page, "Not logged in: every lesson is locked");
await hold(page, 2500);
await clearCaption(page);
await page.screenshot({ path: "docs/screenshot-locked.png" });

const raw = await fetch(`${EDGE}/videos/welcome.webm`);
await showResponse(page, `${EDGE}/videos/welcome.webm`, raw.status, await raw.text(), "Access denied: no signature");
await caption(page, "The video file itself, without a signed link: 403", "bad");
await hold(page, 3000);

// ---------- 2. log in ----------
await page.goto(`${APP}/lessons/welcome`);
await caption(page, "Opening a lesson sends you to log in");
await snap(page, 1200);
await page.getByLabel("Email").pressSequentially("student@northwind.test", { delay: 25 });
await snap(page, 300);
await page.getByLabel("Password").pressSequentially("northwind-student", { delay: 25 });
await snap(page, 600);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(`${APP}/lessons/welcome`);

// ---------- 3. plays ----------
await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
await page.evaluate(() => {
  const v = document.querySelector("video");
  v.muted = true;
  return v.play();
});
await caption(page, "Logged in as a student: the lesson plays", "good");
await hold(page, 3000);
console.log("video duration reported by the browser:", await page.evaluate(() => document.querySelector("video").duration));
await clearCaption(page);
await page.screenshot({ path: "docs/screenshot-player.png" });
const signedUrl = await page.getByTestId("signed-url").textContent();
const expires = Number(new URL(signedUrl).searchParams.get("Expires"));

await caption(page, `The video link is signed and stops working after ${TTL} seconds`);
while (Date.now() / 1000 < expires + 0.5) await hold(page, 1000, 1000);

// ---------- 4. expired ----------
const page2 = await context.newPage();
const later = await fetch(signedUrl);
await showResponse(page2, signedUrl, later.status, await later.text(), `Same link, ${TTL} seconds later: expired`);
await caption(page2, "Copied or shared links expire: 403", "bad");
await hold(page2, 3500);
await clearCaption(page2);
await page2.screenshot({ path: "docs/screenshot-expired-403.png" });
await page2.close();

// ---------- extra screenshots (not in the GIF) ----------
await page.goto(`${APP}/lessons/final-project`);
await page.screenshot({ path: "docs/screenshot-student-draft-404.png" });
await context.clearCookies();
await page.goto(`${APP}/login?callbackUrl=%2Fadmin`);
await page.getByLabel("Email").fill("admin@northwind.test");
await page.getByLabel("Password").fill("northwind-admin");
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(`${APP}/admin`);
await page.screenshot({ path: "docs/screenshot-admin.png", fullPage: true });

await browser.close();
stopServers();

// ---------- encode GIF ----------
const gif = GIFEncoder();
const scale = 0.8;
const outW = Math.round(W * scale);
const outH = Math.round(H * scale);
for (const f of frames) {
  const src = PNG.sync.read(f.png);
  const data = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const sy = Math.min(src.height - 1, Math.floor(y / scale));
      const si = (sy * src.width + sx) * 4;
      const di = (y * outW + x) * 4;
      data[di] = src.data[si];
      data[di + 1] = src.data[si + 1];
      data[di + 2] = src.data[si + 2];
      data[di + 3] = 255;
    }
  }
  const palette = quantize(data, 256);
  gif.writeFrame(applyPalette(data, palette), outW, outH, { palette, delay: f.delay });
}
gif.finish();
writeFileSync("docs/demo.gif", gif.bytes());
console.log(`docs/demo.gif: ${frames.length} frames, ${Math.round(gif.bytes().length / 1024)} KB`);
