/**
 * Local stand-in for CloudFront in front of a private S3 bucket.
 *
 * It serves STORAGE_DIR/videos/* only when the URL carries a valid CloudFront
 * canned-policy signature (verified with the public key, like a CloudFront key
 * group) and has not expired. Everything else gets 403 with an XML body shaped
 * like CloudFront's. There is no way to list or read files without a signature,
 * which is what the S3 bucket policy + Origin Access Control give you on AWS.
 *
 * Run: npm run edge   (npm run dev starts it together with Next.js)
 */
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { verifySignedUrl } from "../lib/edge/verify";
import { VIDEO_KEY_PATTERN } from "../lib/video/signer";
import { loadEnvFile } from "./env";

loadEnvFile(".env.local");

const port = Number(process.env.EDGE_PORT ?? 4001);
const publicBaseUrl = process.env.VIDEO_BASE_URL ?? `http://localhost:${port}`;
const storageDir = path.resolve(process.env.STORAGE_DIR ?? "./storage/data");
const keyPairId = process.env.CF_KEY_PAIR_ID;
const publicKeyFile = process.env.CF_PUBLIC_KEY_FILE;
if (!keyPairId || !publicKeyFile) {
  console.error('Missing CF_KEY_PAIR_ID or CF_PUBLIC_KEY_FILE. Run "npm run setup" first.');
  process.exit(1);
}
const trustedKeys = { [keyPairId]: readFileSync(publicKeyFile, "utf8") };

const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm" };

function deny(res: ServerResponse, reason: string) {
  res.writeHead(403, { "Content-Type": "text/xml", "Cache-Control": "no-store", "X-Edge-Reason": reason });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access denied</Message></Error>`);
}

const server = createServer((req, res) => {
  // Allow the app origin to read the video (the <video> element does not need CORS, fetch() does).
  res.setHeader("Access-Control-Allow-Origin", "*");
  const target = req.url ?? "/";
  if (req.method !== "GET" && req.method !== "HEAD") return deny(res, "method");

  const pathname = target.split("?")[0];
  const match = /^\/videos\/([^/]+)$/.exec(pathname);
  if (!match || !VIDEO_KEY_PATTERN.test(match[1])) return deny(res, "not-a-video-path");

  const result = verifySignedUrl(target, { publicBaseUrl, trustedKeys });
  if (!result.ok) return deny(res, result.reason);

  const file = path.join(storageDir, "videos", match[1]);
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    // CloudFront + OAC returns 403 (not 404) for a missing object when the role cannot list the bucket.
    return deny(res, "no-such-object");
  }
  const headers: Record<string, string | number> = {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`Local edge (CloudFront stand-in) on ${publicBaseUrl}, serving ${path.join(storageDir, "videos")}`);
});
