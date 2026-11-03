import "server-only";
import { config } from "./config";
import { storageFromConfig } from "./storage";
import type { Lesson } from "./types";
import { signVideoUrl, type SignedVideoUrl } from "./video/signer";

export function appStorage() {
  return storageFromConfig(config());
}

export function signedUrlFor(lesson: Lesson): SignedVideoUrl {
  const c = config();
  return signVideoUrl({
    baseUrl: c.VIDEO_BASE_URL,
    key: lesson.videoKey,
    keyPairId: c.CF_KEY_PAIR_ID,
    privateKey: c.privateKey,
    ttlSeconds: c.SIGNED_URL_TTL_SECONDS,
    algorithm: c.CF_HASH_ALGORITHM,
  });
}
