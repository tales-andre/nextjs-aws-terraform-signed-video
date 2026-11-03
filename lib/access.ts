import type { AppUser, Lesson } from "./types";

/**
 * Authorization rules, kept as pure functions so they are unit-tested and
 * reused by pages, the signed-URL API route and server actions alike.
 */

export function canViewLesson(user: AppUser | null | undefined, lesson: Lesson): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return lesson.published;
}

export function canManageLessons(user: AppUser | null | undefined): boolean {
  return user?.role === "admin";
}

/** Lessons a visitor may see listed. Logged-out visitors see published titles only (no video). */
export function listableLessons(user: AppUser | null | undefined, lessons: Lesson[]): Lesson[] {
  if (user?.role === "admin") return lessons;
  return lessons.filter((l) => l.published);
}
