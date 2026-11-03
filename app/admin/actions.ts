"use server";
import { revalidatePath } from "next/cache";
import { canManageLessons } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { addLesson, setPublished } from "@/lib/lessons";
import { appStorage } from "@/lib/server";

export interface UploadState {
  ok: boolean;
  message: string;
}

// Server actions are public HTTP endpoints: each one checks the role itself,
// the admin page hiding the form is not a security control.

export async function uploadLesson(_prev: UploadState | null, form: FormData): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!canManageLessons(user)) return { ok: false, message: "Admins only." };

  const file = form.get("video");
  if (!(file instanceof File)) return { ok: false, message: "Choose a video file." };
  const result = await addLesson(appStorage(), {
    title: String(form.get("title") ?? ""),
    summary: String(form.get("summary") ?? ""),
    bytes: new Uint8Array(await file.arrayBuffer()),
    declaredType: file.type,
    maxBytes: config().MAX_UPLOAD_MB * 1024 * 1024,
  });
  if (!result.ok) return { ok: false, message: result.error };
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, message: `Uploaded "${result.lesson.title}" as a draft.` };
}

export async function togglePublished(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!canManageLessons(user)) throw new Error("Admins only.");
  await setPublished(appStorage(), String(form.get("id")), form.get("published") === "true");
  revalidatePath("/");
  revalidatePath("/admin");
}
