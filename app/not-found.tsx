import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1>404: lesson not found</h1>
      <p className="lead" data-testid="not-found">
        This lesson does not exist or is not published yet.
      </p>
      <Link href="/">Back to lessons</Link>
    </main>
  );
}
