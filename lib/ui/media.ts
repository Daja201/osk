// Je obrazovka široká (počítač, tablet na šířku)? Podle toho se editor ukáže vedle grafu, nebo jako panel zespodu.
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)"; // stejná hranice jako Tailwind lg:

function subscribe(listener: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function useIsWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
}
