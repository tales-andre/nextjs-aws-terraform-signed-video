import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AppConfig } from "../config";
import type { Lesson } from "../types";
import { VIDEO_KEY_PATTERN } from "../video/signer";

/**
 * Where lesson metadata and video files live.
 *  - local: a folder on disk; the local edge server serves STORAGE_DIR/videos.
 *  - s3:    the private bucket; CloudFront serves videos/* through OAC.
 * Lesson metadata is one small JSON object (no database), see README "Limits".
 */
export interface Storage {
  readLessons(): Promise<Lesson[] | null>;
  writeLessons(lessons: Lesson[]): Promise<void>;
  putVideo(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

function assertKey(key: string) {
  if (!VIDEO_KEY_PATTERN.test(key)) throw new Error(`Unexpected video key: ${key}`);
}

export function localStorage(dir: string): Storage {
  const lessonsFile = path.join(dir, "lessons.json");
  return {
    async readLessons() {
      try {
        return JSON.parse(await readFile(lessonsFile, "utf8")) as Lesson[];
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async writeLessons(lessons) {
      await mkdir(dir, { recursive: true });
      const tmp = `${lessonsFile}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(lessons, null, 2));
      await rename(tmp, lessonsFile);
    },
    async putVideo(key, body) {
      assertKey(key);
      const videos = path.join(dir, "videos");
      await mkdir(videos, { recursive: true });
      await writeFile(path.join(videos, key), body);
    },
  };
}

export function s3Storage(bucket: string, region?: string, client = new S3Client({ region })): Storage {
  const lessonsKey = "meta/lessons.json";
  return {
    async readLessons() {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: lessonsKey }));
        return JSON.parse(await res.Body!.transformToString()) as Lesson[];
      } catch (err) {
        if (err instanceof NoSuchKey || (err as { name?: string }).name === "NoSuchKey") return null;
        throw err;
      }
    },
    async writeLessons(lessons) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: lessonsKey,
          Body: JSON.stringify(lessons, null, 2),
          ContentType: "application/json",
        }),
      );
    },
    async putVideo(key, body, contentType) {
      assertKey(key);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: `videos/${key}`, Body: body, ContentType: contentType }),
      );
    },
  };
}

export function storageFromConfig(c: AppConfig): Storage {
  return c.STORAGE_DRIVER === "s3" ? s3Storage(c.S3_BUCKET!, c.AWS_REGION) : localStorage(c.STORAGE_DIR);
}
