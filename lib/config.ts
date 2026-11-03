import { readFileSync } from "node:fs";
import { z } from "zod";

const schema = z.object({
  VIDEO_BASE_URL: z.string().url(),
  CF_KEY_PAIR_ID: z.string().min(1),
  CF_PRIVATE_KEY: z.string().optional(),
  CF_PRIVATE_KEY_FILE: z.string().optional(),
  CF_HASH_ALGORITHM: z.enum(["SHA1", "SHA256"]).default("SHA1"),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(120),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().default("./storage/data"),
  S3_BUCKET: z.string().optional(),
  AWS_REGION: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(25).default(20),
});

export type AppConfig = z.infer<typeof schema> & { privateKey: string };

let cached: AppConfig | undefined;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid configuration: ${fields}. Run "npm run setup" for local defaults.`);
  }
  const c = parsed.data;
  // Accept a PEM with real newlines or with "\n" escapes (handy in .env files and CI secrets).
  let privateKey = c.CF_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!privateKey && c.CF_PRIVATE_KEY_FILE) privateKey = readFileSync(c.CF_PRIVATE_KEY_FILE, "utf8");
  if (!privateKey || !privateKey.includes("PRIVATE KEY")) {
    throw new Error("Set CF_PRIVATE_KEY (PEM) or CF_PRIVATE_KEY_FILE.");
  }
  if (c.STORAGE_DRIVER === "s3" && !c.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET.");
  return { ...c, privateKey };
}

export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}
