// Runs once when the Next.js server process starts (`next start`, `next dev`, the Docker image).
// A missing or invalid setting stops the process there, with a message that names the variable,
// instead of letting the server pass the load balancer health check and fail every page.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
