
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/staff/",
        "/dashboard/",
        "/api/",
      ],
    },
    sitemap: "https://heritagehub-vert.vercel.app/sitemap.xml",
  };
}
