/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Auto-tree-shakes barrel-exported icon/utility packages so importing
  // e.g. `{ Search } from "lucide-react"` only pulls that one icon's module
  // into the bundle instead of Next having to trace through the whole
  // package's barrel file. Pure build-time optimization — no behaviour
  // change, just less JS shipped to the browser on every page.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  async headers() {
    return [
      {
        // Allow the guard PWA service worker (served at /g/sw.js) to claim a
        // broader scope of /g than its default /g/. Without this header,
        // navigator.serviceWorker.register("/g/sw.js", { scope: "/g" })
        // fails with "scope url should start with the given script url".
        source: "/g/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/g" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
