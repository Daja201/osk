import AskSection from "@/components/AskSection";
import CityOverview from "@/components/CityOverview";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-700 px-5 py-4">
        <h1 className="text-2xl font-semibold">Osk</h1>
        <span className="text-neutral-400">reálná data CITIQ</span>
      </header>

      <AskSection />
      <CityOverview />
    </main>
  );
}
