import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omni",
  description: "Say it once. Omni remembers or answers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="[--font-sans:ui-sans-serif,system-ui,-apple-system,'Inter',sans-serif] antialiased">
        {children}
      </body>
    </html>
  );
}
