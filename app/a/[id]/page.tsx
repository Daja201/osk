import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import SavedView, { SavedMissing } from "@/components/SavedView";
import { loadAnswer } from "@/lib/answers";

export const metadata: Metadata = {
  title: "Uložená odpověď – Osk",
  description: "Odpověď z dat dopravních senzorů v Olomouci i s tím, jak vznikla a odkud jsou data.",
};

// Uložená odpověď se čte z disku až při požadavku (connection), proto je uvnitř <Suspense>.
async function Saved({ params }: { params: PageProps<"/a/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const answer = await loadAnswer(id);
  return answer ? <SavedView answer={answer} /> : <SavedMissing />;
}

export default function SavedAnswerPage({ params }: PageProps<"/a/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-tabule" />}>
      <Saved params={params} />
    </Suspense>
  );
}
