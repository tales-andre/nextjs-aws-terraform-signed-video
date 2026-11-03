// Node.js-only part of instrumentation.ts (process.exit is not available in the Edge runtime).
import { checkStartupConfig } from "./lib/config";

try {
  checkStartupConfig();
} catch (err) {
  console.error(`[startup] ${(err as Error).message}`);
  process.exit(1);
}
