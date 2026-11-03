import { expect, test, type Page } from "@playwright/test";

const STUDENT = { email: "student@northwind.test", password: "northwind-student" };
const ADMIN = { email: "admin@northwind.test", password: "northwind-admin" };
const EDGE = "http://localhost:4101";

async function login(page: Page, who: { email: string; password: string }, next = "/") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByTestId("who")).toHaveText(who.email);
}

async function expectVideoPlays(page: Page) {
  const video = page.getByTestId("lesson-video");
  await expect(video).toBeVisible();
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-testid=lesson-video]");
    return !!v && v.readyState >= 2;
  });
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
  });
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-testid=lesson-video]");
    return !!v && v.currentTime > 0.5;
  });
}

test("logged out: the lesson redirects to login, the API says 401 and a raw video link says 403", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByTestId("lesson-welcome")).toContainText("Locked: log in");
  await expect(page.getByTestId("lesson-final-project")).toHaveCount(0);

  await page.goto("/lessons/welcome");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Flessons%2Fwelcome/);

  const api = await request.get("/api/lessons/welcome/url");
  expect(api.status()).toBe(401);

  const raw = await request.get(`${EDGE}/videos/welcome.webm`);
  expect(raw.status()).toBe(403);
  expect(raw.headers()["x-edge-reason"]).toBe("missing-signature");
});

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(STUDENT.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("Wrong email or password.");
});

test("student: the video plays, the copied link works now and gives 403 once it expires", async ({ page, request }) => {
  await login(page, STUDENT, "/lessons/welcome");
  await expect(page).toHaveURL(/\/lessons\/welcome$/);
  await expectVideoPlays(page);

  // Click "Copy video link" and read what landed on the clipboard: that is the link under test.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy video link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toBe(await page.getByTestId("signed-url").textContent());
  expect(url).toMatch(new RegExp(`^${EDGE}/videos/welcome\\.webm\\?Expires=\\d+&Key-Pair-Id=.+&Signature=.+`));
  const expires = Number(new URL(url).searchParams.get("Expires"));

  const now = await request.get(url);
  expect(now.status()).toBe(200);
  expect(now.headers()["content-type"]).toBe("video/webm");

  // Same signature on another file: refused.
  const other = await request.get(url.replace("/videos/welcome.webm", "/videos/final-project.webm"));
  expect(other.status()).toBe(403);
  expect(other.headers()["x-edge-reason"]).toBe("bad-signature");

  // Wait past Expires (5 s in this run), then the very same link is refused.
  await expect
    .poll(async () => (await request.get(url)).status(), { timeout: 15_000, intervals: [1000] })
    .toBe(403);
  const later = await request.get(url);
  expect(later.headers()["x-edge-reason"]).toBe("expired");
  await expect(page.getByTestId("expiry")).toContainText("expired");

  // The logged-in player can still get a fresh link; the app re-checks the session to sign it.
  const fresh = await page.evaluate(async () => (await fetch("/api/lessons/welcome/url")).json());
  expect(fresh.expiresAt).toBeGreaterThan(expires);
  expect((await request.get(fresh.url)).status()).toBe(200);
});

test("student: drafts and the admin page are off limits", async ({ page }) => {
  await login(page, STUDENT);
  await expect(page.getByTestId("lesson-final-project")).toHaveCount(0);

  const draft = await page.goto("/lessons/final-project");
  expect(draft?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();

  const api = await page.evaluate(async () => (await fetch("/api/lessons/final-project/url")).status);
  expect(api).toBe(404);

  const admin = await page.goto("/admin");
  expect(admin?.status()).toBe(403);
  await expect(page.getByTestId("forbidden")).toBeVisible();
});

test("admin: an uploaded lesson stays hidden from students until it is published", async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, ADMIN, "/admin");
  await admin.goto("/admin");
  await admin.getByLabel("Title").fill("Uploaded in the e2e test");
  await admin.getByLabel(/Video \(MP4 or WebM/).setInputFiles("storage/seed/study-plan.webm");
  await admin.getByRole("button", { name: "Upload as draft" }).click();
  await expect(admin.getByRole("status")).toHaveText('Uploaded "Uploaded in the e2e test" as a draft.');

  const row = admin.locator("tr", { hasText: "Uploaded in the e2e test" });
  await expect(row).toContainText("Draft");

  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await login(student, STUDENT);
  await expect(student.getByText("Uploaded in the e2e test")).toHaveCount(0);

  await admin.reload();
  await row.getByRole("button", { name: "Publish" }).click();
  await expect(row).toContainText("Published");

  await student.reload();
  await student.getByTestId(/^lesson-/).filter({ hasText: "Uploaded in the e2e test" }).getByRole("link", { name: "Watch" }).click();
  await expectVideoPlays(student);
  const url = (await student.getByTestId("signed-url").textContent())!;
  expect(url).toMatch(/\/videos\/[0-9a-f-]{36}\.webm\?/); // random object name, not the file name

  await adminCtx.close();
  await studentCtx.close();
});
