"use client";

import { useState } from "react";
import { PRESS } from "./styles";

// Pole pro navazující otázku pod poslední odpovědí. Server k ní přidá kontext z posledních 2 odpovědí.
// Po 10 otázkách je konverzace plná; další otázka patří do nové („Nová otázka“ nahoře).
export default function FollowUp({ turns, max, onAsk }: { turns: number; max: number; onAsk: (question: string) => void }) {
  const [value, setValue] = useState("");
  if (turns >= max) {
    return <p className="m-0 mt-8 text-center text-[16px] text-on-sign-muted">Konverzace má {max} otázek. Další položte jako novou otázku.</p>;
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        onAsk(value);
        setValue("");
      }}
      className="composer mt-8 flex w-full items-center gap-2 rounded-[30px] border-2 border-line bg-surface p-1.5 pl-5"
    >
      <label htmlFor="navazat" className="sr-only">
        Navazující otázka
      </label>
      <input
        id="navazat"
        type="text"
        value={value}
        maxLength={300}
        required
        autoComplete="off"
        enterKeyHint="send"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Navázat otázkou…"
        className="composer-input h-12 min-w-0 flex-1 bg-transparent font-sans text-[17px] font-medium text-ink placeholder:text-muted"
      />
      <span className="shrink-0 text-[14px] text-muted tabular-nums" aria-label={`Otázka ${turns + 1} z ${max}`}>
        {turns + 1}/{max}
      </span>
      <button
        type="submit"
        aria-label="Zeptat se"
        className={`${PRESS} flex size-12 shrink-0 items-center justify-center rounded-full bg-tabule text-white hover:bg-[#0A4482]`}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
