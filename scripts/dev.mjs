// Starts Next.js (port 3000) and the local edge (port 4001) together. Ctrl+C stops both.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".env.local")) {
  console.error('No .env.local yet. Run "npm run setup" first.');
  process.exit(1);
}

const mode = process.argv[2] === "start" ? "start" : "dev";
const procs = [
  spawn(process.execPath, ["node_modules/next/dist/bin/next", mode], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "edge/server.ts"], { stdio: "inherit" }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { stop(); process.exitCode = code ?? 0; }));
