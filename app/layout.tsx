import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northwind Academy (demo)",
  description: "Open-source demo: private lesson videos behind login and short-lived signed links.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Northwind <span>Academy</span>
          </Link>
          <div className="who">
            {user ? (
              <>
                <span data-testid="who">{user.email}</span>
                <span className={`badge ${user.role}`}>{user.role}</span>
                {user.role === "admin" && (
                  <Link className="btn ghost" href="/admin">
                    Admin
                  </Link>
                )}
                <SignOutButton />
              </>
            ) : (
              <Link className="btn ghost" href="/login">
                Log in
              </Link>
            )}
          </div>
        </header>
        {children}
        <footer className="footer">Northwind Academy is a fictional school. Open-source demo.</footer>
      </body>
    </html>
  );
}
