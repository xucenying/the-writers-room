import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Writers' Room",
  description: "Six agents collaborate on your next great speech."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
