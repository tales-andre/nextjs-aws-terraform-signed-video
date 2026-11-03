import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canViewLesson } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { findLesson } from "@/lib/lessons";
import { appStorage, signedUrlFor } from "@/lib/server";
import { Player } from "./player";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/lessons/${id}`)}`);

  const lesson = await findLesson(appStorage(), id);
  // Drafts answer 404 for students, the same as a lesson that does not exist.
  if (!lesson || !canViewLesson(user, lesson)) notFound();

  const signed = signedUrlFor(lesson);
  return (
    <main>
      <p>
        <Link href="/">&larr; All lessons</Link>
      </p>
      <h1>
        {lesson.title} {!lesson.published && <span className="badge draft">draft</span>}
      </h1>
      <p className="lead">{lesson.summary}</p>
      <Player lessonId={lesson.id} initialUrl={signed.url} initialExpiresAt={signed.expiresAt} />
    </main>
  );
}
