import { NextResponse } from "next/server";
import { canViewLesson } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { findLesson } from "@/lib/lessons";
import { appStorage, signedUrlFor } from "@/lib/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Returns a fresh short-lived signed URL. The player calls it again when a link expires mid-lesson. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401, headers: noStore });
  const { id } = await ctx.params;
  const lesson = await findLesson(appStorage(), id);
  // Same answer for "does not exist" and "not allowed", so drafts are not discoverable.
  if (!lesson || !canViewLesson(user, lesson)) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
  }
  return NextResponse.json(signedUrlFor(lesson), { headers: noStore });
}
