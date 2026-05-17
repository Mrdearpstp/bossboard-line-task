import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LineTask",
  description: "Task tracking workspace with LINE-ready workflows"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
