import Link from "next/link";

export default function Forbidden() {
  return (
    <main>
      <h1>403: admins only</h1>
      <p className="lead" data-testid="forbidden">
        You are logged in as a student. Lesson management is for school admins.
      </p>
      <Link href="/">Back to lessons</Link>
    </main>
  );
}
