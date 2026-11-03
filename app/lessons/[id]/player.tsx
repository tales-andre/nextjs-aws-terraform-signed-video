"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  lessonId: string;
  initialUrl: string;
  initialExpiresAt: number;
}

/**
 * Plays the lesson from a short-lived signed URL. If the link expires while the
 * student is still watching (the next range request gets 403), it asks the app
 * for a fresh link and resumes at the same second. The app checks the session
 * again before it signs, so a logged-out tab cannot renew.
 */
export function Player({ lessonId, initialUrl, initialExpiresAt }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const renewing = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  async function renew() {
    if (renewing.current) return;
    renewing.current = true;
    const video = videoRef.current;
    const resumeAt = video?.currentTime ?? 0;
    try {
      const res = await fetch(`/api/lessons/${lessonId}/url`, { cache: "no-store" });
      if (res.status === 401) {
        setProblem("Your session ended. Log in again to keep watching.");
        return;
      }
      if (!res.ok) {
        setProblem("This video is not available.");
        return;
      }
      const next = (await res.json()) as { url: string; expiresAt: number };
      setUrl(next.url);
      setExpiresAt(next.expiresAt);
      if (video) {
        video.addEventListener("loadedmetadata", () => (video.currentTime = resumeAt), { once: true });
      }
    } finally {
      renewing.current = false;
    }
  }

  const secondsLeft = expiresAt - now;
  return (
    <div className="player card">
      <video
        ref={videoRef}
        data-testid="lesson-video"
        src={url}
        controls
        preload="auto"
        playsInline
        onError={() => {
          // Only an expired link is renewed; any other failure is shown, not retried in a loop.
          if (Math.floor(Date.now() / 1000) >= expiresAt - 1) void renew();
          else setProblem("The video could not be loaded.");
        }}
      />
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="linkbox">
        <span className={`expiry ${secondsLeft <= 0 ? "gone" : ""}`} data-testid="expiry">
          {secondsLeft > 0 ? `This link expires in ${secondsLeft}s` : "This link has expired (the player renews it if you keep watching)"}
        </span>
        <button
          className="btn light small"
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(url).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy video link"}
        </button>
        <code data-testid="signed-url">{url}</code>
      </div>
    </div>
  );
}
