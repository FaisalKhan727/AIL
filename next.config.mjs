/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
