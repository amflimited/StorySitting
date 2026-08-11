import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StorySitting",
    short_name: "StorySitting",
    description: "The family Story Shelf for consent-first phone interviews and finished chapters.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#e9e6dd",
    theme_color: "#1f5754",
    categories: ["lifestyle", "photo", "books"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }
    ]
  };
}
