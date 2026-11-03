import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone (small server bundle); local runs use `next start`.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  // Do not write an AGENTS.md file into the project on `next dev`.
  agentRules: false,
  experimental: {
    // Enables forbidden() so the admin page answers a real HTTP 403 to students.
    authInterrupts: true,
    // Admin uploads go through a server action; see MAX_UPLOAD_MB and README "Limits".
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
