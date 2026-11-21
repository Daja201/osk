"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import { copyText, downloadCsv, downloadPng, downloadSvg, tableTsv } from "@/lib/ui/export";
import type { ChartView } from "@/lib/view";
import { effectiveView } from "./ViewChart";
import { isLocalhost, useShareUrl } from "@/lib/ui/qr";
import QrCode from "./QrCode";
import { PRESS } from "./styles";

// Tlačítko „QR kód“ a okno s velkým QR kódem (vyfotit z obrazovky, stáhnout do prezentace, zkopírovat odkaz).
// Obojí v jedné komponentě, dialog si drží sama.
function QrButton({ url, name, className }: { url: string; name: string; className: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const close = () => dialog.current?.close();
  const button = `${PRESS} min-h-11 rounded-full border border-line px-4 py-2 text-[15px] font-semibold text-ink hover:border-ink`;
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={className} aria-haspopup="dialog">
        QR kód
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="qr-nadpis"
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="m-auto w-[min(420px,calc(100vw-32px))] rounded-3xl bg-surface p-0 text-ink backdrop:bg-black/50"
      >
        <div className="flex flex-col items-center gap-3 p-5 text-center sm:gap-4 sm:p-8">
          <h2 id="qr-nadpis" className="m-0 font-sign text-[22px] leading-tight font-bold sm:text-[26px]">
            Odkaz na tuhle odpověď
          </h2>
          <div ref={box} className="rounded-2xl bg-white p-2">
            <QrCode text={url} size={240} className="block h-auto w-[min(240px,58vw)]" />
          </div>
          <p className="m-0 text-[15px] text-muted">
            Platí 7 dní. Kdo ho otevře, uvidí stejnou odpověď i s tím, jak vznikla a odkud jsou data.
          </p>
          <code className="block w-full rounded-xl bg-band px-3 py-2 font-mono text-[13px] break-all">{url}</code>
          {isLocalhost(url) && (
            <p className="m-0 rounded-xl border border-bad px-3 py-2 text-left text-[14px] text-bad">
              Odkaz vede na localhost, z telefonu nepůjde otevřít. Otevřete aplikaci přes adresu počítače v síti, nebo nastavte
              NEXT_PUBLIC_SITE_URL.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className={button}
              onClick={async () => {
                setCopied(await copyText(url));
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Zkopírováno" : "Kopírovat odkaz"}
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                const svg = box.current?.querySelector("svg");
                if (svg) void downloadPng(svg, `${name}-qr.png`);
              }}
            >
              Stáhnout QR
            </button>
            <button type="button" className={button} onClick={close}>
              Zavřít
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

// Tlačítka pod odpovědí: QR kód a odkaz na sdílení (platí 7 dní), PNG grafu, CSV dat, tabulka do schránky.
// Stahuje se přesně to, co je vidět (vzhled z editoru): PNG a SVG grafu, CSV a tabulka pro Excel / Google Tabulky.
export default function AnswerActions({
  answer,
  svg,
  view = null,
  onEdit,
  editing = false,
}: {
  answer: AskAnswer;
  svg: RefObject<SVGSVGElement | null>;
  view?: ChartView | null;
  onEdit?: () => void;
  editing?: boolean;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const url = useShareUrl(answer.id);
  const result = answer.result?.ok ? answer.result : null;
  const shown = effectiveView(answer, view);
  const isChart = shown !== null && shown.format !== "table";
  const name = `osk-${answer.id ?? "odpoved"}`;
  const flash = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus(null), 2000);
  };

  const button = `${PRESS} inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-[15px] font-semibold text-white hover:bg-white/25`;
  type Action = { label: string; hint?: string; run: () => Promise<void> | void };
  const downloads: Action[] = [];
  if (isChart) {
    downloads.push({
      label: "Obrázek PNG",
      hint: "do prezentace, dokumentu, e-mailu",
      run: async () => {
        if (!svg.current) return;
        try {
          await downloadPng(svg.current, `${name}.png`);
        } catch {
          flash("Obrázek se nepodařilo vytvořit");
        }
      },
    });
    downloads.push({
      label: "Obrázek SVG",
      hint: "ostrý v jakékoli velikosti, v PowerPointu jde upravit",
      run: async () => {
        if (svg.current) await downloadSvg(svg.current, `${name}.svg`);
      },
    });
  }
  if (result && answer.format !== "source") {
    downloads.push({ label: "Data CSV", hint: "pro Excel a Google Tabulky", run: () => downloadCsv(result, `${name}.csv`) });
    // Data jako tabulka do schránky: vloží se do Excelu / Google Tabulek rovnou do buněk.
    downloads.push({
      label: "Kopírovat do tabulky",
      hint: "vložit do Excelu nebo Google Tabulek (Ctrl+V)",
      run: async () => flash((await copyText(tableTsv(result))) ? "Data zkopírována, vložte je do Excelu nebo Google Tabulek" : "Kopírování se nepovedlo"),
    });
  }
  if (!onEdit && downloads.length === 0 && !url) return null;

  // Pořadí: Upravit vzhled · QR kód · Kopírovat odkaz · Stáhnout ▾ (relative: na mobilu se k řadě váže nabídka)
  return (
    <div className="relative flex flex-wrap items-center gap-2">
      {onEdit && (
        <button type="button" onClick={onEdit} className={button} aria-expanded={editing}>
          {editing ? "Zavřít úpravy" : "Upravit vzhled"}
        </button>
      )}
      {url && <QrButton url={url} name={name} className={button} />}
      {url && (
        <button
          type="button"
          onClick={async () => flash((await copyText(url)) ? "Odkaz zkopírován, platí 7 dní" : "Kopírování se nepovedlo")}
          className={button}
        >
          Kopírovat odkaz
        </button>
      )}
      {downloads.length > 0 && <DownloadMenu actions={downloads} className={button} />}
      <span aria-live="polite" className="text-[15px] text-on-sign-muted">
        {status}
      </span>
    </div>
  );
}

// „Stáhnout“ s nabídkou (nativní <details>, funguje i klávesnicí). Zavře ji Esc, výběr položky nebo klik mimo.
// Klik mimo hlídáme přes pointerdown na dokumentu, ne přes blur: Safari tlačítkům při kliknutí nedává focus,
// takže by se nabídka zavřela dřív, než by se kliknutí na položku provedlo.
function DownloadMenu({ actions, className }: { actions: { label: string; hint?: string; run: () => Promise<void> | void }[]; className: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  return (
    <details
      ref={menu}
      className="sm:relative"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <summary className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        Stáhnout
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      {/* Na mobilu se nabídka otevře NAHORU od levého okraje řady tlačítek (dole by ji uřízl konec obrazovky,
          vpravo by vyjela za okraj), na větší obrazovce pod tlačítkem. Ne position: fixed: rodič má transform
          (posun obrazovek), takže by se fixed vázalo k němu, ne k oknu. */}
      <ul className="animate-rise absolute bottom-full left-0 z-30 m-0 mb-2 flex w-[min(18rem,calc(100vw-2rem))] list-none flex-col rounded-2xl bg-surface p-1.5 text-ink shadow-[0_8px_28px_rgba(0,0,0,0.3)] sm:top-full sm:bottom-auto sm:mt-2 sm:mb-0">
        {actions.map((action) => (
          <li key={action.label}>
            <button
              type="button"
              onClick={() => {
                close();
                void action.run();
              }}
              className="flex w-full cursor-pointer flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-band"
            >
              <span className="text-[15px] font-semibold">{action.label}</span>
              {action.hint && <span className="text-[13px] text-muted">{action.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
