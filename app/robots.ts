import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.storysitting.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/start", "/demo"],
        disallow: [
          "/api", "/auth", "/dashboard", "/debug", "/env-check", "/invite",
          "/permission", "/result", "/staff", "/start/success", "/story-rooms"
        ]
      }
    ],
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`
  };
}
