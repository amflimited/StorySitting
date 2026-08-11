import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.storysitting.com").replace(/\/$/, "");
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/start`, changeFrequency: "monthly", priority: .9 },
    { url: `${baseUrl}/demo`, changeFrequency: "monthly", priority: .8 }
  ];
}
