import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Krea AI Gallery (Next.js)",
  description: "A fast, infinite-scroll gallery for Krea AI images.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
