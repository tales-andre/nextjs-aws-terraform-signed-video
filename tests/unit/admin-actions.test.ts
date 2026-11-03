import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../lib/types";

// Server actions are reachable over HTTP by anyone who knows their id, so the
// role check must live inside the action. These tests call the actions directly
// as a student and as a logged-out visitor.

const state = vi.hoisted(() => ({ user: null as AppUser | null, writes: 0 }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/config", () => ({ config: () => ({ MAX_UPLOAD_MB: 1 }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/server", () => ({
  appStorage: () => ({
    readLessons: async () => [],
    writeLessons: async () => void state.writes++,
    putVideo: async () => void state.writes++,
  }),
}));

const { uploadLesson, togglePublished } = await import("../../app/admin/actions");

function uploadForm() {
  const form = new FormData();
  form.set("title", "Sneaky upload");
  form.set("video", new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], "x.webm", { type: "video/webm" }));
  return form;
}

beforeEach(() => {
  state.writes = 0;
});

describe("admin server actions", () => {
  it("refuse an upload from a student or a logged-out visitor, and store nothing", async () => {
    for (const user of [null, { id: "s", email: "s@x.test", name: "S", role: "student" } as AppUser]) {
      state.user = user;
      expect(await uploadLesson(null, uploadForm())).toEqual({ ok: false, message: "Admins only." });
    }
    expect(state.writes).toBe(0);
  });

  it("refuse publishing from a student", async () => {
    state.user = { id: "s", email: "s@x.test", name: "S", role: "student" };
    const form = new FormData();
    form.set("id", "final-project");
    form.set("published", "true");
    await expect(togglePublished(form)).rejects.toThrow("Admins only.");
    expect(state.writes).toBe(0);
  });

  it("accept the same upload from an admin", async () => {
    state.user = { id: "a", email: "a@x.test", name: "A", role: "admin" };
    const res = await uploadLesson(null, uploadForm());
    expect(res.ok).toBe(true);
    expect(state.writes).toBe(2); // the video and the lesson list
  });
});
