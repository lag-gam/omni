import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { DesktopShell } from "@/components/desktop-shell";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Omni",
  description: "Say it once. Omni remembers or answers.",
  icons: {
    icon: "/omni-logo.png",
    apple: "/omni-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="font-sans antialiased">
        <DesktopShell />
        {children}
      </body>
    </html>
  );
}
