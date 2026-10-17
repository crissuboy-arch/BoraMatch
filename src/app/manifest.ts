import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BoraMatch",
    short_name: "BoraMatch",
    description: "O amor não tem fronteiras.",
    start_url: "/?view=app",
    display: "standalone",
    background_color: "#FFF9F5",
    theme_color: "#101F38",
    lang: "pt",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
