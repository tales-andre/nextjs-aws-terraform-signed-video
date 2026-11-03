// One-time local setup: a throwaway RSA key pair (stands in for the CloudFront key group),
// .env.local with demo settings, and the sample videos copied into local storage.
// Safe to re-run: existing keys and .env.local are kept unless you pass --force.
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const force = process.argv.includes("--force");
const keyDir = ".local/keys";
const privFile = path.join(keyDir, "cloudfront-private.pem");
const pubFile = path.join(keyDir, "cloudfront-public.pem");

mkdirSync(keyDir, { recursive: true });
if (force || !existsSync(privFile)) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(privFile, privateKey, { mode: 0o600 });
  writeFileSync(pubFile, publicKey);
  console.log(`created ${privFile} and ${pubFile}`);
}

const envFile = ".env.local";
if (force || !existsSync(envFile)) {
  const lines = [
    "# Local demo settings written by scripts/setup.mjs. Not used on AWS (see infra/).",
    "NEXTAUTH_URL=http://localhost:3000",
    `NEXTAUTH_SECRET=${randomBytes(32).toString("base64url")}`,
    "STUDENT_PASSWORD=northwind-student",
    "ADMIN_PASSWORD=northwind-admin",
    "VIDEO_BASE_URL=http://localhost:4001",
    "CF_KEY_PAIR_ID=K2LOCALDEMOKEY",
    `CF_PRIVATE_KEY_FILE=${privFile.replace(/\\/g, "/")}`,
    `CF_PUBLIC_KEY_FILE=${pubFile.replace(/\\/g, "/")}`,
    "SIGNED_URL_TTL_SECONDS=60",
    "STORAGE_DRIVER=local",
    "STORAGE_DIR=./storage/data",
    "",
  ];
  writeFileSync(envFile, lines.join("\n"));
  console.log(`created ${envFile}`);
}

const videos = "storage/data/videos";
mkdirSync(videos, { recursive: true });
for (const f of readdirSync("storage/seed")) {
  if (!/\.(mp4|webm)$/.test(f)) continue;
  const dest = path.join(videos, f);
  if (force || !existsSync(dest)) copyFileSync(path.join("storage/seed", f), dest);
}
console.log("local storage ready: storage/data/videos");
console.log('next: "npm run dev", then open http://localhost:3000 (student@northwind.test / northwind-student)');
