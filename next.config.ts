import type { NextConfig } from "next";
const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = configuredUrl ? new URL(configuredUrl).origin : "";
const realtimeOrigin = supabaseOrigin.replace(/^http/, "ws");
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co ${supabaseOrigin}; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co ${supabaseOrigin} ${realtimeOrigin}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
export default config;
