// Fresh storage for the e2e run: seed videos only, no saved lessons (so the seed list applies).
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const dir = ".local/e2e-storage";
rmSync(dir, { recursive: true, force: true });
mkdirSync(path.join(dir, "videos"), { recursive: true });
for (const f of readdirSync("storage/seed")) {
  if (/\.(mp4|webm)$/.test(f)) copyFileSync(path.join("storage/seed", f), path.join(dir, "videos", f));
}
console.log(`e2e storage reset: ${dir}`);
