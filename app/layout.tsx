import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AccessProvider } from "@/components/access-provider";
import { PushNotificationPrompt } from "@/components/push-notifications";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sydney Laptop Cafes",
  description:
    "A curated map of 24 laptop-friendly cafes across Sydney — open-source and community maintained.",
  appleWebApp: {
    capable: true,
    title: "Cafe Map",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#1C1512",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} dark h-full`}>
      <body className="h-full antialiased">
        <AccessProvider>
          {children}
          <PushNotificationPrompt />
        </AccessProvider>
      </body>
    </html>
  );
}
