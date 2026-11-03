// Generates the short sample lesson videos in storage/seed/ (no stock footage, no third-party content).
// A canvas animation is recorded with the browser's MediaRecorder into WebM (VP8).
// MediaRecorder leaves the duration out of the file, so fix-webm-duration writes it in
// (otherwise players show an unknown length and cannot seek well).
// Usage: PW_CHANNEL=msedge node scripts/make-sample-videos.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { launchBrowser } from "./browser.mjs";

const VIDEOS = [
  { file: "welcome.webm", title: "Welcome to Northwind Academy", subtitle: "Lesson 1", color: ["#1f6f78", "#14213d"] },
  { file: "study-plan.webm", title: "Building a weekly study plan", subtitle: "Lesson 2", color: ["#7c3aed", "#1e1b4b"] },
  { file: "final-project.webm", title: "Final project brief", subtitle: "Draft lesson", color: ["#b45309", "#422006"] },
];
const SECONDS = 12;

const browser = await launchBrowser();
const page = await browser.newPage();
await page.setContent("<canvas id=c width=960 height=540></canvas>");
await page.addScriptTag({ path: createRequire(import.meta.url).resolve("fix-webm-duration") });
await mkdir("storage/seed", { recursive: true });

for (const v of VIDEOS) {
  const base64 = await page.evaluate(
    async ({ v, seconds }) => {
      const canvas = document.getElementById("c");
      const ctx = canvas.getContext("2d");
      const draw = (t) => {
        const g = ctx.createLinearGradient(0, 0, 960, 540);
        g.addColorStop(0, v.color[0]);
        g.addColorStop(1, v.color[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        const x = 480 + Math.cos(t * 1.3) * 300;
        const y = 270 + Math.sin(t * 1.7) * 150;
        ctx.beginPath();
        ctx.arc(x, y, 120, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 26px Segoe UI, sans-serif";
        ctx.fillText(`NORTHWIND ACADEMY  ·  ${v.subtitle.toUpperCase()}`, 60, 90);
        ctx.font = "700 52px Segoe UI, sans-serif";
        ctx.fillText(v.title, 60, 290);
        ctx.font = "400 26px Segoe UI, sans-serif";
        ctx.fillText("Sample lesson video for the open-source demo", 60, 340);
        const p = Math.min(t / seconds, 1);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(60, 460, 840, 10);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(60, 460, 840 * p, 10);
        ctx.font = "600 24px Consolas, monospace";
        const s = Math.floor(t);
        ctx.fillText(`0:${String(s).padStart(2, "0")}`, 60, 510);
      };
      draw(0);
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 500_000 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      const start = performance.now();
      rec.start(1000);
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          const t = (performance.now() - start) / 1000;
          draw(t);
          if (t >= seconds) {
            clearInterval(timer);
            resolve();
          }
        }, 1000 / 30);
      });
      rec.stop();
      await done;
      const elapsedMs = performance.now() - start;
      const fixed = await window.ysFixWebmDuration(new Blob(chunks, { type: "video/webm" }), elapsedMs, { logger: false });
      const buf = await fixed.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { v, seconds: SECONDS },
  );
  const out = `storage/seed/${v.file}`;
  await writeFile(out, Buffer.from(base64, "base64"));
  console.log(`wrote ${out} (${Math.round(Buffer.byteLength(base64, "base64") / 1024)} KB)`);
}
await browser.close();
