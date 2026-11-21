// Patička na jeden řádek: copyright, tým a odkaz na repozitář.
export default function Footer({ tone }: { tone: "light" | "blue" }) {
  return (
    <footer
      className={`shrink-0 px-4 py-4 text-center text-[13px] leading-normal sm:px-8 ${
        tone === "blue" ? "text-on-sign-muted" : "text-muted"
      }`}
    >
      © 2026 SleepNotFound ·{" "}
      <a href="https://github.com/Daja201/osk" target="_blank" rel="noreferrer" className="text-inherit underline underline-offset-2">
        GitHub
      </a>
    </footer>
  );
}
