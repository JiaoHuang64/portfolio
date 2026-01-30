import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Abraham Yuan — Portfolio",
  description: "Biochemical Engineering | Process Automation | Enzyme Engineering",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
