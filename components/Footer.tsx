// Patička na jeden řádek: autoři, zdroj dat a upozornění, že nejde o službu města.
export default function Footer({ tone }: { tone: "light" | "blue" }) {
  return (
    <footer
      className={`shrink-0 px-4 py-4 text-center text-[13px] leading-normal sm:px-8 ${
        tone === "blue" ? "text-on-sign-muted" : "text-muted"
      }`}
    >
      © 2026 SleepNotFound · Data: senzorová síť Olomouc (CITIQ) · Nejde o oficiální službu města
    </footer>
  );
}
