import { randomUUID } from "node:crypto";
import seed from "../data/seed-lessons.json";
import type { Storage } from "./storage";
import type { Lesson } from "./types";

export async function getLessons(storage: Storage): Promise<Lesson[]> {
  return (await storage.readLessons()) ?? (seed as Lesson[]);
}

export async function findLesson(storage: Storage, id: string): Promise<Lesson | undefined> {
  return (await getLessons(storage)).find((l) => l.id === id);
}

export const ALLOWED_VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
} as const;

/** Checks the first bytes, so a renamed file of another type is refused. */
export function sniffVideoType(bytes: Uint8Array): keyof typeof ALLOWED_VIDEO_TYPES | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video/webm";
  }
  if (bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "video/mp4";
  return null;
}

export interface NewLessonInput {
  title: string;
  summary: string;
  bytes: Uint8Array;
  declaredType: string;
  maxBytes: number;
}

export type AddLessonResult = { ok: true; lesson: Lesson } | { ok: false; error: string };

export async function addLesson(storage: Storage, input: NewLessonInput): Promise<AddLessonResult> {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 80) return { ok: false, error: "Title must be 3 to 80 characters." };
  if (input.bytes.length === 0) return { ok: false, error: "Choose a video file." };
  if (input.bytes.length > input.maxBytes) return { ok: false, error: "The file is larger than the upload limit." };
  const sniffed = sniffVideoType(input.bytes);
  if (!sniffed || sniffed !== input.declaredType) return { ok: false, error: "Only MP4 or WebM video files are accepted." };

  const id = randomUUID().slice(0, 8);
  const lesson: Lesson = {
    id,
    title,
    summary: input.summary.trim().slice(0, 200),
    videoKey: `${randomUUID()}.${ALLOWED_VIDEO_TYPES[sniffed]}`,
    published: false,
  };
  await storage.putVideo(lesson.videoKey, input.bytes, sniffed);
  const lessons = await getLessons(storage);
  await storage.writeLessons([...lessons, lesson]);
  return { ok: true, lesson };
}

export async function setPublished(storage: Storage, id: string, published: boolean): Promise<boolean> {
  const lessons = await getLessons(storage);
  const target = lessons.find((l) => l.id === id);
  if (!target) return false;
  await storage.writeLessons(lessons.map((l) => (l.id === id ? { ...l, published } : l)));
  return true;
}
