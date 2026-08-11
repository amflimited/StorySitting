/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storysitting.com",
        pathname: "/assets/images/product/**"
      }
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb"
    }
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      {
        key: "Content-Security-Policy",
        value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com; object-src 'none'; img-src 'self' data: blob: https://storysitting.com https://*.supabase.co; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; upgrade-insecure-requests`
      }
    ];
    const secretPageHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/permission/:path*", headers: secretPageHeaders },
      { source: "/invite/:path*", headers: secretPageHeaders },
      { source: "/result/:path*", headers: secretPageHeaders },
      { source: "/start/success", headers: secretPageHeaders },
      { source: "/auth/:path*", headers: secretPageHeaders }
    ];
  }
};

export default nextConfig;
