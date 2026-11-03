"use client";
import { useActionState } from "react";
import { uploadLesson, type UploadState } from "./actions";

export function UploadForm({ maxMb }: { maxMb: number }) {
  const [state, action, pending] = useActionState<UploadState | null, FormData>(uploadLesson, null);
  return (
    <form className="form card" action={action}>
      <label>
        Title
        <input name="title" required minLength={3} maxLength={80} />
      </label>
      <label>
        Summary
        <textarea name="summary" rows={2} maxLength={200} />
      </label>
      <label>
        Video (MP4 or WebM, up to {maxMb} MB)
        <input name="video" type="file" accept="video/mp4,video/webm" required />
      </label>
      {state && (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Uploading..." : "Upload as draft"}
      </button>
      <p className="hint">The file is stored under a random name in the private bucket. Nobody can open it without a signed link.</p>
    </form>
  );
}
