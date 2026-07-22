import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RDP LTS Assessment Dashboard",
  description: "Prototype dashboard for Red Dot Penguins LTS 2026 Q1 and Q2 assessment results."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
