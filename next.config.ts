import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        // Keep this stylesheet on Next's native CSS Modules pipeline.
        // `as: "*.css"` otherwise discards its exported class-name mapping.
        condition: { not: { path: "src/app/tickets/tickets.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
