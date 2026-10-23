import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: ["https://thanhly.tudencafe.com/sitemap.xml"],
    host: "https://thanhly.tudencafe.com",
  };
}
