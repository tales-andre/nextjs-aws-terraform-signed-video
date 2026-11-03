import { createHash, timingSafeEqual } from "node:crypto";
import type { AppUser } from "./types";

/**
 * Two fixed demo accounts. Passwords come from environment variables
 * (written to .env.local by `npm run setup`, or injected from SSM Parameter
 * Store on AWS). A real school would use a user table or an identity provider.
 */
const DEMO_USERS: Array<AppUser & { passwordEnv: "STUDENT_PASSWORD" | "ADMIN_PASSWORD" }> = [
  { id: "u-student", email: "student@northwind.test", name: "Sam Student", role: "student", passwordEnv: "STUDENT_PASSWORD" },
  { id: "u-admin", email: "admin@northwind.test", name: "Ada Admin", role: "admin", passwordEnv: "ADMIN_PASSWORD" },
];

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyCredentials(
  email: unknown,
  password: unknown,
  env: Record<string, string | undefined> = process.env,
): AppUser | null {
  if (typeof email !== "string" || typeof password !== "string") return null;
  if (password.length === 0 || password.length > 200) return null;
  const user = DEMO_USERS.find((u) => u.email === email.trim().toLowerCase());
  const expected = user ? env[user.passwordEnv] : undefined;
  // Always compare something, so an unknown email takes the same path as a wrong password.
  const ok = timingSafeEqual(digest(password), digest(expected && expected.length >= 8 ? expected : "\u0000unset"));
  if (!user || !expected || expected.length < 8 || !ok) return null;
  const { passwordEnv: _ignored, ...publicUser } = user;
  return publicUser;
}
