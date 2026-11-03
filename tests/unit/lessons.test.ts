import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../lib/config";
import { addLesson, getLessons, setPublished, sniffVideoType } from "../../lib/lessons";
import { localStorage } from "../../lib/storage";

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftypmp42")]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let dirs: string[] = [];
const tempStorage = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nw-"));
  dirs.push(dir);
  return { dir, storage: localStorage(dir) };
};
afterEach(() => {
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
  dirs = [];
});

describe("video type check", () => {
  it("recognises WebM and MP4 by their first bytes", () => {
    expect(sniffVideoType(WEBM)).toBe("video/webm");
    expect(sniffVideoType(MP4)).toBe("video/mp4");
    expect(sniffVideoType(PNG)).toBeNull();
  });
});

describe("lessons", () => {
  it("falls back to the seed lessons until something is saved", async () => {
    const { storage } = tempStorage();
    const lessons = await getLessons(storage);
    expect(lessons.map((l) => l.id)).toEqual(["welcome", "study-plan", "final-project"]);
    expect(lessons.find((l) => l.id === "final-project")?.published).toBe(false);
  });

  it("stores an upload under a random key as a draft", async () => {
    const { dir, storage } = tempStorage();
    const res = await addLesson(storage, { title: "  New lesson ", summary: "s", bytes: WEBM, declaredType: "video/webm", maxBytes: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lesson.published).toBe(false);
    expect(res.lesson.title).toBe("New lesson");
    expect(res.lesson.videoKey).toMatch(/^[0-9a-f-]{36}\.webm$/);
    expect(readFileSync(path.join(dir, "videos", res.lesson.videoKey))).toEqual(Buffer.from(WEBM));
    expect((await getLessons(storage)).at(-1)?.id).toBe(res.lesson.id);
  });

  it("refuses a file whose content does not match a video type", async () => {
    const { storage } = tempStorage();
    const res = await addLesson(storage, { title: "Sneaky", summary: "", bytes: PNG, declaredType: "video/webm", maxBytes: 100 });
    expect(res).toEqual({ ok: false, error: "Only MP4 or WebM video files are accepted." });
  });

  it("refuses an MP4 declared as WebM, oversize files and bad titles", async () => {
    const { storage } = tempStorage();
    const base = { title: "Fine title", summary: "", bytes: MP4, declaredType: "video/mp4", maxBytes: 100 };
    expect((await addLesson(storage, { ...base, declaredType: "video/webm" })).ok).toBe(false);
    expect((await addLesson(storage, { ...base, maxBytes: 4 })).ok).toBe(false);
    expect((await addLesson(storage, { ...base, title: "x" })).ok).toBe(false);
    expect((await addLesson(storage, base)).ok).toBe(true);
  });

  it("publishes and unpublishes", async () => {
    const { storage } = tempStorage();
    expect(await setPublished(storage, "final-project", true)).toBe(true);
    expect((await getLessons(storage)).find((l) => l.id === "final-project")?.published).toBe(true);
    expect(await setPublished(storage, "missing", true)).toBe(false);
  });
});

describe("config", () => {
  it("explains what is missing instead of starting half-configured", () => {
    expect(() => loadConfig({})).toThrow(/VIDEO_BASE_URL.*CF_KEY_PAIR_ID/);
    expect(() => loadConfig({ VIDEO_BASE_URL: "http://localhost:4001", CF_KEY_PAIR_ID: "K" })).toThrow(/CF_PRIVATE_KEY/);
  });
  it("requires a bucket in s3 mode", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----";
    expect(() =>
      loadConfig({ VIDEO_BASE_URL: "https://d1.cloudfront.net", CF_KEY_PAIR_ID: "K", CF_PRIVATE_KEY: pem, STORAGE_DRIVER: "s3" }),
    ).toThrow(/S3_BUCKET/);
    const c = loadConfig({ VIDEO_BASE_URL: "https://d1.cloudfront.net", CF_KEY_PAIR_ID: "K", CF_PRIVATE_KEY: pem });
    expect(c.privateKey).toContain("\nabc\n");
    expect(c.SIGNED_URL_TTL_SECONDS).toBe(120);
  });
});
