export type Role = "student" | "admin";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  /** Object key under videos/ in the private bucket (or the local storage folder). */
  videoKey: string;
  /** Drafts are visible to admins only. */
  published: boolean;
}
