import { describe, expect, it } from "vitest";
import { isLocalhost, qrModules, qrPath, shareUrl } from "../lib/ui/qr";
import { valueAxis } from "../lib/ui/chart";

describe("QR kód", () => {
  it("odkaz na uloženou odpověď se vejde do malého QR (verze 3–4, 29–33 čtverečků)", () => {
    const modules = qrModules(shareUrl({ id: "QkfDiTzpk7", conversation_id: "Hx7pQ2mN9a" }, "https://osk.example.cz") ?? "");
    expect(modules.length).toBeGreaterThanOrEqual(25);
    expect(modules.length).toBeLessThanOrEqual(33);
    // Tři rohové čtverce (vyhledávací vzory) jsou vždy tmavé v rohu.
    expect(modules[0][0] && modules[0][modules.length - 1] && modules[modules.length - 1][0]).toBe(true);
  });

  it("cesta SVG spojí sousední čtverečky v řádku", () => {
    expect(qrPath([[true, true, false, true]])).toBe("M0 0h2v1h-2zM3 0h1v1h-1z");
  });

  it("adresa a localhost", () => {
    // Odkaz vede na celou konverzaci; starší odpověď bez konverzace na samotnou odpověď.
    expect(shareUrl({ id: "abc", conversation_id: "conv" }, "https://osk.cz/")).toBe("https://osk.cz/c/conv");
    expect(shareUrl({ id: "abc" }, "https://osk.cz/")).toBe("https://osk.cz/a/abc");
    expect(shareUrl({ id: null }, "https://osk.cz")).toBeNull();
    expect(isLocalhost("http://localhost:3000/a/x")).toBe(true);
    expect(isLocalhost("http://192.168.1.20:3000/a/x")).toBe(false);
  });
});

describe("osa grafu", () => {
  it("blízké hodnoty: osa začne nad nulou, ale mírně (nejmenší sloupec aspoň 40 % výšky)", () => {
    const axis = valueAxis([21500, 23000]);
    expect(axis).toEqual({ min: 19000, max: 24000, ticks: [19000, 20000, 21000, 22000, 23000], zoomed: true });
    expect((21500 - axis.min) / (axis.max - axis.min)).toBeGreaterThanOrEqual(0.4);
  });

  it("velké rozdíly, nuly a jediná hodnota: osa od nuly", () => {
    expect(valueAxis([260, 3314, 3607])).toMatchObject({ min: 0, zoomed: false });
    expect(valueAxis([0, 120])).toMatchObject({ min: 0, zoomed: false });
    expect(valueAxis([1500])).toMatchObject({ min: 0, zoomed: false });
    expect(valueAxis([100, 100])).toMatchObject({ min: 0, zoomed: false });
  });

  it("každá hodnota je uvnitř osy a nad nejvyšší je místo na popisek", () => {
    for (const values of [[21500, 23000], [956, 1141, 1217], [30067, 23418], [5, 7]]) {
      const axis = valueAxis(values);
      expect(Math.min(...values)).toBeGreaterThan(axis.min);
      expect(axis.max).toBeGreaterThan(Math.max(...values));
    }
  });
});
