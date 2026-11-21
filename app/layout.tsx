import type { Metadata, Viewport } from "next";
// Písma hostujeme sami (balíčky @fontsource), žádné volání Googlu. Jen řezy, které návrh používá.
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "./globals.css";
import { AskProvider } from "./ask-context";

export const metadata: Metadata = {
  title: "OSK – Zeptej se Olomouce",
  description: "Odpovědi na otázky o dopravě v Olomouci z dat městských senzorů.",
};

// Na telefonech s výřezem (notch) a domovskou lištou sahá stránka až k okrajům; obsah odsadíme přes env(safe-area-inset-*).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs">
      <body>
        <AskProvider>{children}</AskProvider>
      </body>
    </html>
  );
}
