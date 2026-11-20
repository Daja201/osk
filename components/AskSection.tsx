"use client";

import { useState } from "react";
import type { AskAnswer } from "@/lib/ui/types";
import { mockAsk } from "@/lib/ui/mockAnswer";
import AnswerCard from "./AnswerCard";
import Receipt from "./Receipt";

const suggestions = [
  "Kolik aut projelo včera ulicí 17. listopadu?",
  "Kolik aut včera vjelo na parkoviště Flora?",
  "Která čidla nevysílají?",
];

// Otázka + odpověď + účtenka. Drží stav stránky (prázdno / načítání / odpověď / chyba).
export default function AskSection() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    setLoading(true);
    setError(null);
    try {
      // TODO: nahradit voláním /api/ask, až bude hotová AI smyčka.
      setAnswer(await mockAsk(trimmed));
    } catch {
      setError("Odpověď se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="rounded-lg border border-neutral-700 p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <label htmlFor="question" className="mb-2 block text-lg">
            Na co se chcete zeptat?
          </label>
          <div className="flex gap-3">
            <input
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Kolik aut včera projelo ulicí 17. listopadu?"
              maxLength={300}
              className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-800/60 px-4 py-2 text-lg placeholder:text-neutral-500 focus:outline-2 focus:outline-indigo-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded border border-neutral-600 px-5 py-2 text-lg hover:bg-neutral-800 focus:outline-2 focus:outline-indigo-400 disabled:opacity-50"
            >
              {loading ? "Hledám…" : "Zeptat se"}
            </button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => ask(suggestion)}
              disabled={loading}
              className="rounded bg-neutral-800 px-3 py-1 text-neutral-300 hover:bg-neutral-700 focus:outline-2 focus:outline-indigo-400"
            >
              {suggestion}
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-3 text-red-300">
            {error}{" "}
            <button type="button" className="underline" onClick={() => ask(question)}>
              Zkusit znovu
            </button>
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <AnswerCard answer={answer} loading={loading} />
        <Receipt answer={answer} />
      </div>
    </>
  );
}
