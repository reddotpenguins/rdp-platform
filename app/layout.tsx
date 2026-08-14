import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RDP LTS Assessment Dashboard",
  description: "Prototype dashboard for Red Dot Penguins LTS assessment results."
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
