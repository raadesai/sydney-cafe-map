import type { MetadataRoute } from "next";

// Installability (Add to Home Screen) is what unlocks web push on iOS.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sydney Cafe Map",
    short_name: "Cafe Map",
    description:
      "A curated map of laptop-friendly cafes, restaurants, hikes and experiences across Sydney.",
    start_url: "/",
    display: "standalone",
    background_color: "#1C1512",
    theme_color: "#1C1512",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
