import { describe, expect, it } from "vitest";
import { canManageLessons, canViewLesson, listableLessons } from "../../lib/access";
import type { AppUser, Lesson } from "../../lib/types";
import { verifyCredentials } from "../../lib/users";

const student: AppUser = { id: "s", email: "s@x.test", name: "S", role: "student" };
const admin: AppUser = { id: "a", email: "a@x.test", name: "A", role: "admin" };
const published: Lesson = { id: "p", title: "P", summary: "", videoKey: "p.webm", published: true };
const draft: Lesson = { id: "d", title: "D", summary: "", videoKey: "d.webm", published: false };

describe("access rules", () => {
  it("logged-out visitors cannot watch anything", () => {
    expect(canViewLesson(null, published)).toBe(false);
    expect(canViewLesson(undefined, draft)).toBe(false);
  });
  it("students watch published lessons only", () => {
    expect(canViewLesson(student, published)).toBe(true);
    expect(canViewLesson(student, draft)).toBe(false);
  });
  it("admins watch drafts too", () => {
    expect(canViewLesson(admin, draft)).toBe(true);
  });
  it("only admins manage lessons", () => {
    expect(canManageLessons(admin)).toBe(true);
    expect(canManageLessons(student)).toBe(false);
    expect(canManageLessons(null)).toBe(false);
  });
  it("drafts are not even listed for students or visitors", () => {
    expect(listableLessons(null, [published, draft])).toEqual([published]);
    expect(listableLessons(student, [published, draft])).toEqual([published]);
    expect(listableLessons(admin, [published, draft])).toEqual([published, draft]);
  });
});

describe("demo credentials", () => {
  const env = { STUDENT_PASSWORD: "student-pass-1", ADMIN_PASSWORD: "admin-pass-1" };
  it("returns the user with its role, without the password setting", () => {
    expect(verifyCredentials("student@northwind.test", "student-pass-1", env)).toEqual({
      id: "u-student",
      email: "student@northwind.test",
      name: "Sam Student",
      role: "student",
    });
    expect(verifyCredentials(" Admin@Northwind.test ", "admin-pass-1", env)?.role).toBe("admin");
  });
  it("rejects a wrong password, another user's password and unknown emails", () => {
    expect(verifyCredentials("student@northwind.test", "nope-nope", env)).toBeNull();
    expect(verifyCredentials("student@northwind.test", "admin-pass-1", env)).toBeNull();
    expect(verifyCredentials("someone@northwind.test", "student-pass-1", env)).toBeNull();
  });
  it("refuses to log anyone in when the password is unset or too short", () => {
    expect(verifyCredentials("admin@northwind.test", "", {})).toBeNull();
    expect(verifyCredentials("admin@northwind.test", "short", { ADMIN_PASSWORD: "short" })).toBeNull();
  });
  it("ignores non-string input", () => {
    expect(verifyCredentials(undefined, undefined, env)).toBeNull();
    expect(verifyCredentials(["student@northwind.test"], "student-pass-1", env)).toBeNull();
  });
});
