import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  // Only same-site paths, so the login page cannot be used as an open redirect.
  const next = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  return (
    <main>
      <h1>Log in</h1>
      <p className="lead">Demo accounts: student@northwind.test and admin@northwind.test.</p>
      {next !== "/" && <div className="notice">Log in to watch this lesson.</div>}
      <LoginForm next={next} />
    </main>
  );
}
