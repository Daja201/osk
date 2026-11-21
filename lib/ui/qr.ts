// QR kód s odkazem na uloženou odpověď (/a/<id>). Kódování dělá knihovna qrcode-generator (MIT),
// my z ní jen čteme čtverečky a kreslíme je jako jednu cestu SVG. Testy: tests/qr.test.ts.
import { useSyncExternalStore } from "react";
import qrcode from "qrcode-generator";

// Úroveň opravy chyb M (~15 %): kód se načte i z fotky slajdu nebo trochu rozmazaný.
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

// Tmavé čtverečky jako jedna cesta SVG (jednotka = 1 čtvereček). Sousední v řádku se spojí do jednoho obdélníku.
export function qrPath(modules: boolean[][]): string {
  let d = "";
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return d;
}

// Adresa uložené odpovědi. NEXT_PUBLIC_SITE_URL = veřejná adresa (na demu adresa notebooku v síti),
// jinak adresa, ze které se stránka právě otevřela. Na „localhost“ by QR z telefonu nefungoval.
export function shareUrl(id: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/a/${id}`;
}

const noSubscribe = () => () => {};

// Odkaz ke sdílení v prohlížeči. Na serveru adresu neznáme, proto null (QR se ukáže až v prohlížeči).
export function useShareUrl(id: string | null): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => (id ? shareUrl(id, process.env.NEXT_PUBLIC_SITE_URL || window.location.origin) : null),
    () => null,
  );
}

export function isLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
}
