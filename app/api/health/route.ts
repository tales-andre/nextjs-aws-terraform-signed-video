// Load balancer health check. Does not touch storage or secrets.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
