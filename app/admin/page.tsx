import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { canManageLessons } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getLessons } from "@/lib/lessons";
import { appStorage } from "@/lib/server";
import { togglePublished } from "./actions";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=%2Fadmin");
  if (!canManageLessons(user)) forbidden();

  const lessons = await getLessons(appStorage());
  return (
    <main>
      <h1>Manage lessons</h1>
      <p className="lead">New uploads start as drafts. Students only see published lessons.</p>
      <table className="admin">
        <thead>
          <tr>
            <th>Lesson</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((l) => (
            <tr key={l.id} data-testid={`admin-row-${l.id}`}>
              <td>
                <Link href={`/lessons/${l.id}`}>{l.title}</Link>
              </td>
              <td>{l.published ? "Published" : "Draft"}</td>
              <td>
                <form action={togglePublished}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="published" value={l.published ? "false" : "true"} />
                  <button className="btn light small" type="submit">
                    {l.published ? "Unpublish" : "Publish"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Upload a lesson video</h2>
      <UploadForm maxMb={config().MAX_UPLOAD_MB} />
    </main>
  );
}
