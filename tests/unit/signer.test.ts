import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignedUrl } from "../../lib/edge/verify";
import { signVideoUrl } from "../../lib/video/signer";

// A fresh key pair per test run, like a CloudFront public key + key group.
const pair = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
const main = pair();
const other = pair();

const BASE = "https://d111111abcdef8.cloudfront.net";
const T0 = Date.UTC(2026, 10, 3, 12, 0, 0);
const sign = (over: Partial<Parameters<typeof signVideoUrl>[0]> = {}) =>
  signVideoUrl({ baseUrl: BASE, key: "welcome.webm", keyPairId: "K2MAIN", privateKey: main.privateKey, ttlSeconds: 60, now: T0, ...over });
const pathOf = (url: string) => url.slice(BASE.length);
const check = (url: string, now = T0, keys: Record<string, string> = { K2MAIN: main.publicKey }) =>
  verifySignedUrl(pathOf(url), { publicBaseUrl: BASE, trustedKeys: keys, now });

describe("signVideoUrl", () => {
  it("produces a CloudFront canned-policy URL with Expires, Signature and Key-Pair-Id", () => {
    const { url, expiresAt } = sign();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(`${BASE}/videos/welcome.webm`);
    expect(u.searchParams.get("Expires")).toBe(String(expiresAt));
    expect(expiresAt).toBe(T0 / 1000 + 60);
    expect(u.searchParams.get("Key-Pair-Id")).toBe("K2MAIN");
    expect(u.searchParams.get("Signature")).toMatch(/^[A-Za-z0-9~_-]+$/); // CloudFront-safe base64
    expect(u.searchParams.has("Policy")).toBe(false);
  });

  it("signs the exact canned policy CloudFront documents (checked without our verifier)", () => {
    const { url, expiresAt } = sign();
    const u = new URL(url);
    const policy = `{"Statement":[{"Resource":"${BASE}/videos/welcome.webm","Condition":{"DateLessThan":{"AWS:EpochTime":${expiresAt}}}}]}`;
    const sig = Buffer.from(u.searchParams.get("Signature")!.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/"), "base64");
    expect(verify("RSA-SHA1", Buffer.from(policy), createPublicKey(main.publicKey), sig)).toBe(true);
  });

  it("refuses keys that are not app-generated video names (no path tricks)", () => {
    for (const key of ["../secret.webm", "videos/a.webm", "a.exe", "", "A B.mp4"]) {
      expect(() => sign({ key })).toThrow(/unexpected video key/i);
    }
  });

  it("refuses a non-positive or huge TTL", () => {
    expect(() => sign({ ttlSeconds: 0 })).toThrow();
    expect(() => sign({ ttlSeconds: 90_000 })).toThrow();
  });
});

describe("verifySignedUrl (local CloudFront stand-in)", () => {
  it("accepts a fresh link", () => {
    expect(check(sign().url)).toEqual({ ok: true, keyPairId: "K2MAIN", expires: T0 / 1000 + 60 });
  });

  it("accepts it one second before expiry and rejects it at expiry", () => {
    const { url, expiresAt } = sign();
    expect(check(url, (expiresAt - 1) * 1000).ok).toBe(true);
    expect(check(url, expiresAt * 1000)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a link with no signature at all", () => {
    expect(check(`${BASE}/videos/welcome.webm`)).toEqual({ ok: false, reason: "missing-signature" });
  });

  it("rejects a signature reused on another video", () => {
    const tampered = sign().url.replace("/videos/welcome.webm", "/videos/final-project.webm");
    expect(check(tampered)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a link whose expiry was pushed forward by hand", () => {
    const { url, expiresAt } = sign();
    const tampered = url.replace(`Expires=${expiresAt}`, `Expires=${expiresAt + 3600}`);
    expect(check(tampered)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a link signed by a key outside the key group", () => {
    const forged = sign({ privateKey: other.privateKey });
    expect(check(forged.url)).toEqual({ ok: false, reason: "bad-signature" });
    expect(check(sign({ keyPairId: "K2OTHER" }).url)).toEqual({ ok: false, reason: "unknown-key-pair" });
  });

  it("rejects extra query parameters added after signing", () => {
    expect(check(`${sign().url}&download=1`)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects duplicated signing parameters", () => {
    const { url, expiresAt } = sign();
    expect(check(`${url}&Expires=${expiresAt + 999}`)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("does not accept custom policies (out of scope for this stand-in)", () => {
    expect(check(`${BASE}/videos/welcome.webm?Policy=abc&Signature=x&Key-Pair-Id=K2MAIN`)).toEqual({
      ok: false,
      reason: "custom-policy-not-supported",
    });
  });

  it("supports the optional SHA-256 signatures (Hash-Algorithm=SHA256)", () => {
    const { url } = sign({ algorithm: "SHA256" });
    expect(new URL(url).searchParams.get("Hash-Algorithm")).toBe("SHA256");
    expect(check(url).ok).toBe(true);
    expect(check(url.replace("Hash-Algorithm=SHA256", "Hash-Algorithm=SHA1")).ok).toBe(false);
  });

  it("rejects a link signed for a different domain", () => {
    const { url } = sign({ baseUrl: "https://evil.example" });
    const res = verifySignedUrl(url.slice("https://evil.example".length), {
      publicBaseUrl: BASE,
      trustedKeys: { K2MAIN: main.publicKey },
      now: T0,
    });
    expect(res).toEqual({ ok: false, reason: "bad-signature" });
  });
});
