import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";

// Starts a second copy of the production build with one bad setting and checks that the
// process exits at startup with a message naming that setting, instead of serving pages
// (and passing a load balancer health check) while every request fails.
test("a bad setting stops the server at startup and names the variable", async () => {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3199"], {
    env: { ...process.env, VIDEO_BASE_URL: "not-a-url", NEXTAUTH_URL: "http://localhost:3199" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 30_000);
    child.on("exit", (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });

  expect(code, `server kept running; output:\n${output}`).not.toBeNull();
  expect(code).not.toBe(0);
  expect(output).toContain("Missing or invalid configuration: VIDEO_BASE_URL");

  // The server never answered: nothing is listening on its port.
  await expect(fetch("http://localhost:3199/api/health")).rejects.toThrow();
});
