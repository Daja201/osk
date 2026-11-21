// Ověřené číslo ve větě: žluté podtržení jako vodorovné dopravní značení.
// `size="main"` je velké hlavní číslo, `"inline"` číslo v textu, `"chip"` malá ukázka na bílém pozadí.
const STYLES = {
  main: "font-sign text-[76px] leading-none font-bold tracking-[-0.015em] decoration-[5px] underline-offset-[9px] sm:text-[132px] sm:decoration-[8px] sm:underline-offset-[14px]",
  inline: "decoration-4 underline-offset-[7px]",
  chip: "rounded-[5px] bg-tabule px-2 font-semibold text-white decoration-3 underline-offset-4",
} as const;

export default function NumberMark({ children, size }: { children: React.ReactNode; size: keyof typeof STYLES }) {
  return (
    <span
      className={`whitespace-nowrap underline decoration-marking [text-decoration-skip-ink:none] ${STYLES[size]}`}
    >
      {children}
    </span>
  );
}
