import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeptej se Olomouce",
  description: "Odpovědi na otázky o dopravě v Olomouci z dat senzorů CITIQ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
