"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button className="btn ghost" onClick={() => signOut({ callbackUrl: "/" })}>
      Sign out
    </button>
  );
}
