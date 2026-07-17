import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Writers' Room | Stand-up Sets",
  description: "Five agents collaborate on your next great stand-up set."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
