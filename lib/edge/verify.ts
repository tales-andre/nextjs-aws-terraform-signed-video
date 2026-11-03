import { createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";

/**
 * Verifies a CloudFront signed URL that uses a canned policy, the same way the
 * CloudFront edge does before it serves a private object:
 *
 *   1. Expires, Signature and Key-Pair-Id must all be present.
 *   2. Key-Pair-Id must belong to a trusted public key (a CloudFront key group).
 *   3. The signature must match the canned policy rebuilt from the URL itself,
 *      so changing the path, the expiry or any other query value breaks it.
 *   4. The current time must be before Expires.
 *
 * Used by the local edge server (edge/server.ts) so that the exact signing code
 * that runs against CloudFront in AWS is exercised locally, with no AWS account.
 * Custom policies (Policy=...) are not supported by this emulator.
 */

export type VerifyFailure =
  | "missing-signature"
  | "custom-policy-not-supported"
  | "unknown-key-pair"
  | "bad-signature"
  | "expired";

export type VerifyResult =
  | { ok: true; keyPairId: string; expires: number }
  | { ok: false; reason: VerifyFailure };

export interface VerifyOptions {
  /** Public origin clients use, e.g. https://d111.cloudfront.net or http://localhost:4001 */
  publicBaseUrl: string;
  /** Trusted public keys by Key-Pair-Id (the "key group"). PEM strings or KeyObjects. */
  trustedKeys: Record<string, string | KeyObject>;
  /** Current time in milliseconds. */
  now?: number;
}

const SIGNING_PARAMS = new Set(["Expires", "Signature", "Key-Pair-Id", "Hash-Algorithm", "Policy"]);

function fromCloudFrontBase64(value: string): Buffer {
  const standard = value.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
  return Buffer.from(standard, "base64");
}

/**
 * @param pathAndQuery the raw request target as received, e.g. "/videos/a.webm?Expires=...".
 */
export function verifySignedUrl(pathAndQuery: string, opts: VerifyOptions): VerifyResult {
  const qIndex = pathAndQuery.indexOf("?");
  const rawPath = qIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, qIndex);
  const rawQuery = qIndex === -1 ? "" : pathAndQuery.slice(qIndex + 1);

  const params = new Map<string, string>();
  const kept: string[] = [];
  for (const pair of rawQuery.split("&").filter(Boolean)) {
    const eq = pair.indexOf("=");
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? "" : pair.slice(eq + 1);
    if (SIGNING_PARAMS.has(key)) {
      if (params.has(key)) return { ok: false, reason: "bad-signature" }; // duplicated param
      params.set(key, decodeURIComponent(value));
    } else {
      kept.push(pair);
    }
  }

  if (params.has("Policy")) return { ok: false, reason: "custom-policy-not-supported" };
  const expiresRaw = params.get("Expires");
  const signature = params.get("Signature");
  const keyPairId = params.get("Key-Pair-Id");
  if (!expiresRaw || !signature || !keyPairId) return { ok: false, reason: "missing-signature" };
  if (!/^\d{1,12}$/.test(expiresRaw)) return { ok: false, reason: "bad-signature" };
  const expires = Number(expiresRaw);

  const trusted = opts.trustedKeys[keyPairId];
  if (!trusted) return { ok: false, reason: "unknown-key-pair" };

  const hashAlgorithm = params.get("Hash-Algorithm") ?? "SHA1";
  if (hashAlgorithm !== "SHA1" && hashAlgorithm !== "SHA256") return { ok: false, reason: "bad-signature" };

  const base = opts.publicBaseUrl.replace(/\/+$/, "");
  const resource = base + rawPath + (kept.length ? `?${kept.join("&")}` : "");
  const policy = JSON.stringify({
    Statement: [{ Resource: resource, Condition: { DateLessThan: { "AWS:EpochTime": expires } } }],
  });

  const key = typeof trusted === "string" ? createPublicKey(trusted) : trusted;
  let valid = false;
  try {
    valid = cryptoVerify(
      hashAlgorithm === "SHA256" ? "RSA-SHA256" : "RSA-SHA1",
      Buffer.from(policy),
      key,
      fromCloudFrontBase64(signature),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad-signature" };

  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000);
  if (nowSeconds >= expires) return { ok: false, reason: "expired" };

  return { ok: true, keyPairId, expires };
}
