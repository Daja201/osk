"use client";

import { useId, useState } from "react";
import { PALETTE, PALETTE_NAMES, type PaletteName } from "@/lib/ai/palette";
import type { SeriesDisplayOk } from "@/lib/citiq/display";
import { formatNumber } from "@/lib/ui/format";
import { type AxisSetting, type ChartView, SWATCHES, colorSlots, customAxisError, formatOptions, slotColor, uniformColors } from "@/lib/view";
import { PRESS } from "./styles";

const LABEL = "text-[14px] font-semibold uppercase tracking-wide text-muted";
const CHIP = `${PRESS} min-h-11 rounded-full border px-3.5 py-1.5 text-[15px] font-semibold sm:min-h-9 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100`;
const chip = (active: boolean) => `${CHIP} ${active ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:border-ink"}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
      <legend className={`${LABEL} mb-2 p-0`}>{title}</legend>
      {children}
    </fieldset>
  );
}

// Barvy dat: nahoře místa (tečka v jejich barvě), klik vybere místo a pod ním je JEDEN vzorník pro něj.
// Žádný vzorník u každého místa zvlášť, ať editor není přehlcený.
function DataColors({ slots, colorOf, onChange }: { slots: string[]; colorOf: (slot: number) => string; onChange: (slot: number, color: string) => void }) {
  const [selected, setSelected] = useState(0);
  const slot = Math.min(selected, slots.length - 1);
  const value = colorOf(slot);
  const customId = useId();
  return (
    <Section title="Barvy dat">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Které místo obarvit">
        {slots.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={slot === i}
            onClick={() => setSelected(i)}
            className={`${chip(slot === i)} inline-flex max-w-full items-center gap-2`}
          >
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full ring-1 ring-black/15" style={{ background: colorOf(i) }} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${slots[slot]}: barva ${color}`}
            aria-pressed={value.toUpperCase() === color}
            onClick={() => onChange(slot, color)}
            className={`size-10 cursor-pointer rounded-md ring-1 ring-line transition-transform hover:scale-110 sm:size-7 ${value.toUpperCase() === color ? "outline-2 outline-offset-2 outline-ink" : ""}`}
            style={{ background: color }}
          />
        ))}
        <label htmlFor={customId} className="sr-only">
          Vlastní barva pro {slots[slot]}
        </label>
        <input
          id={customId}
          type="color"
          value={value.toLowerCase()}
          onChange={(event) => onChange(slot, event.target.value.toUpperCase())}
          title="Vlastní barva"
          className="h-10 w-12 cursor-pointer rounded-md border border-line bg-surface p-0.5 sm:h-7 sm:w-10"
        />
      </div>
    </Section>
  );
}

function AxisControls({ axis, values, onChange }: { axis: AxisSetting; values: number[]; onChange: (axis: AxisSetting) => void }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Rozpracované hodnoty z polí: do grafu jdou, až když dávají smysl (customAxisError).
  const [draft, setDraft] = useState({ min: axis.mode === "custom" ? String(axis.min) : "0", max: axis.mode === "custom" ? String(axis.max) : String(hi) });
  const min = Number(draft.min.replace(/\s/g, "").replace(",", "."));
  const max = Number(draft.max.replace(/\s/g, "").replace(",", "."));
  const error = axis.mode === "custom" ? customAxisError(values, min, max) : null;
  const setCustom = (next: typeof draft) => {
    setDraft(next);
    const nextMin = Number(next.min.replace(/\s/g, "").replace(",", "."));
    const nextMax = Number(next.max.replace(/\s/g, "").replace(",", "."));
    if (customAxisError(values, nextMin, nextMax) === null) onChange({ mode: "custom", min: nextMin, max: nextMax });
  };
  const input = "h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink tabular-nums";
  return (
    <Section title="Osa">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip(axis.mode === "auto")} aria-pressed={axis.mode === "auto"} onClick={() => onChange({ mode: "auto" })}>
          Automaticky
        </button>
        <button type="button" className={chip(axis.mode === "zero")} aria-pressed={axis.mode === "zero"} onClick={() => onChange({ mode: "zero" })}>
          Od nuly
        </button>
        <button
          type="button"
          className={chip(axis.mode === "custom")}
          aria-pressed={axis.mode === "custom"}
          onClick={() => setCustom(draft)}
        >
          Vlastní
        </button>
      </div>
      {axis.mode === "custom" || error ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[14px] text-muted">
              Od
              <input inputMode="numeric" value={draft.min} onChange={(e) => setCustom({ ...draft, min: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-[14px] text-muted">
              Do
              <input inputMode="numeric" value={draft.max} onChange={(e) => setCustom({ ...draft, max: e.target.value })} className={input} />
            </label>
          </div>
          <p className={`m-0 text-[14px] ${error ? "text-bad" : "text-muted"}`} aria-live="polite">
            {error ?? `Hodnoty jsou od ${formatNumber(lo)} do ${formatNumber(hi)}. Když osa nezačíná nulou, graf to označí.`}
          </p>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-muted">
          {axis.mode === "auto" ? "U blízkých hodnot se osa mírně přiblíží (a graf to označí)." : "Sloupce začínají na nule."}
        </p>
      )}
    </Section>
  );
}

type Tab = "typ" | "nadpis" | "barvy" | "osa";

// Editor vzhledu grafu: typ, nadpis, pozadí, barvy, osa, QR. Změny se hned ukazují v grafu.
// Sekce jsou v záložkách: editor je tak zhruba stejně vysoký jako graf vedle něj a nevzniká prázdné místo.
export default function ChartEditor({
  result,
  view,
  onChange,
  onReset,
  onSave,
  onClose,
  saving,
  saved,
  hasLink,
}: {
  hasLink: boolean; // má odpověď odkaz (id)? Bez něj QR není na co vést
  result: SeriesDisplayOk;
  view: ChartView;
  onChange: (view: ChartView) => void;
  onReset: () => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const background = view.background ?? "bila"; // bez volby je pozadí bílé (nezávisle na režimu stránky)
  const set = (patch: Partial<ChartView>) => onChange({ ...view, ...patch });
  const slots = view.format === "table" ? [] : colorSlots(result, view.format);
  const values = result.data.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const isChart = view.format !== "table";
  const id = useId();

  const tabs: { id: Tab; label: string }[] = [
    { id: "typ", label: "Typ" },
    { id: "nadpis", label: "Nadpis" },
    { id: "barvy", label: "Barvy" },
    ...(isChart && view.format !== "pie" ? [{ id: "osa" as const, label: "Osa" }] : []),
  ];
  const [chosen, setChosen] = useState<Tab>("typ");
  // Když záložka zmizí (např. Osa po přepnutí na koláč), ukáže se Typ.
  const tab = tabs.some((t) => t.id === chosen) ? chosen : "typ";

  return (
    <section aria-label="Úprava vzhledu" className="flex flex-col gap-4 rounded-3xl bg-surface p-5 text-ink">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 font-sign text-[22px] leading-tight font-bold">Úprava vzhledu</h2>
        <button type="button" onClick={onClose} className={`${PRESS} min-h-9 rounded-full border border-line px-4 py-1.5 text-[15px] font-semibold hover:border-ink`}>
          Hotovo
        </button>
      </div>

      <div role="tablist" aria-label="Části vzhledu" className="grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-band p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${id}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${id}-panel`}
            onClick={() => setChosen(t.id)}
            className={`${PRESS} min-h-9 rounded-full px-2 text-[14px] font-semibold ${tab === t.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className="flex min-h-[180px] flex-col gap-5">
        {tab === "typ" && (
          <>
            <Section title="Typ grafu">
              <div className="flex flex-wrap gap-2">
                {formatOptions(result).map((option) => (
                  <button
                    key={option.format}
                    type="button"
                    disabled={option.disabled !== null}
                    title={option.disabled ?? undefined}
                    aria-pressed={view.format === option.format}
                    onClick={() => set({ format: option.format })}
                    className={chip(view.format === option.format)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Section>
            {isChart && (
              <Section title="QR kód v grafu">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={chip(view.qr)} aria-pressed={view.qr} onClick={() => set({ qr: true })}>
                    Zapnutý
                  </button>
                  <button type="button" className={chip(!view.qr)} aria-pressed={!view.qr} onClick={() => set({ qr: false })}>
                    Vypnutý
                  </button>
                </div>
                {!hasLink && <p className="m-0 text-[14px] text-muted">Testovací odpověď nemá odkaz, proto QR v grafu není.</p>}
              </Section>
            )}
          </>
        )}

        {tab === "nadpis" && (
          <Section title="Nadpis">
            <input
              aria-label="Nadpis"
              value={view.title}
              maxLength={120}
              onChange={(event) => set({ title: event.target.value })}
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink"
            />
          </Section>
        )}

        {tab === "barvy" && (
          <>
            <Section title="Pozadí">
              <div className="flex flex-wrap gap-1.5">
                {PALETTE_NAMES.map((name: PaletteName) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`Pozadí ${PALETTE[name].label}`}
                    aria-pressed={background === name}
                    title={PALETTE[name].label}
                    onClick={() => set({ background: name })}
                    className={`size-8 cursor-pointer rounded-md ring-1 ring-line transition-transform hover:scale-110 ${background === name ? "outline-2 outline-offset-2 outline-ink" : ""}`}
                    style={{ background: PALETTE[name].bg }}
                  />
                ))}
              </div>
            </Section>
            {slots.length > 0 && (
              <DataColors
                key={view.format}
                slots={slots}
                colorOf={(i) => slotColor(view, i, uniformColors(result, view.format))}
                onChange={(i, color) => {
                  const colors = [...view.colors];
                  while (colors.length < slots.length) colors.push(null);
                  colors[i] = color;
                  set({ colors });
                }}
              />
            )}
          </>
        )}

        {tab === "osa" && <AxisControls key={view.axis.mode} axis={view.axis} values={values} onChange={(axis) => set({ axis })} />}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={`${PRESS} min-h-10 flex-1 rounded-full bg-tabule px-3 py-2 text-[15px] font-semibold text-white disabled:opacity-60`}
          >
            {saving ? "Ukládám…" : saved ? "Uloženo" : "Uložit do odkazu"}
          </button>
          <button type="button" onClick={onReset} className={`${PRESS} min-h-10 rounded-full border border-line px-3 py-2 text-[15px] font-semibold hover:border-ink`}>
            Původní
          </button>
        </div>
      </div>
    </section>
  );
}
