import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { AppUser, Role } from "./types";
import { verifyCredentials } from "./users";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        return verifyCredentials(credentials?.email, credentials?.password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as AppUser;
        token.role = u.role;
        token.uid = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, { id: token.uid, role: token.role });
      }
      return session;
    },
  },
};

/** The signed-in user, or null. Every page, API route and server action calls this itself. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as (Partial<AppUser> & { role?: Role }) | undefined;
  if (!u?.email || !u.role || !u.id) return null;
  return { id: u.id, email: u.email, name: u.name ?? u.email, role: u.role };
}
