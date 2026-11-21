import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import ConversationView from "@/components/ConversationView";
import { SavedMissing } from "@/components/SavedView";
import { loadConversation } from "@/lib/conversations";

export const metadata: Metadata = {
  title: "Uložená konverzace – OSK",
  description: "Otázky a odpovědi z dat senzorů v Olomouci i s tím, jak vznikly a odkud jsou data.",
};

// Konverzace se čte z disku až při požadavku (connection), proto je uvnitř <Suspense>.
async function Saved({ params }: { params: PageProps<"/c/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const conversation = await loadConversation(id);
  return conversation ? <ConversationView answers={conversation.answers} expiresAt={conversation.expires_at} /> : <SavedMissing />;
}

export default function SavedConversationPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-tabule" />}>
      <Saved params={params} />
    </Suspense>
  );
}
