import Link from "next/link";
import { listableLessons } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { getLessons } from "@/lib/lessons";
import { appStorage } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  const lessons = listableLessons(user, await getLessons(appStorage()));
  return (
    <main>
      <h1>Course lessons</h1>
      <p className="lead">
        {user
          ? "Pick a lesson. Each video plays through a private link that expires after a short time."
          : "Lesson videos are for enrolled students. Log in to watch."}
      </p>
      <div className="grid">
        {lessons.map((l) => (
          <div className="card lesson-row" key={l.id} data-testid={`lesson-${l.id}`}>
            <div>
              <h3>
                {l.title} {!l.published && <span className="badge draft">draft</span>}
              </h3>
              <p>{l.summary}</p>
            </div>
            {user ? (
              <Link className="btn" href={`/lessons/${l.id}`}>
                Watch
              </Link>
            ) : (
              <span className="locked">Locked: log in</span>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
