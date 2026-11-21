import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnswer } from "../lib/ui/ask-client";
import { viewOf } from "../lib/ui/answer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("zpracování odpovědi /api/ask", () => {
  it("zobrazí omezení počtu dotazů zvlášť a s dobou čekání", async () => {
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429, headers: { "Retry-After": "42" } })),
    );

    const answer = await getAnswer("Kolik aut projelo?");

    expect(answer.reason).toEqual({
      code: "RATE_LIMIT_ERROR",
      message: "Počkejte prosím 42 s a zkuste to znovu.",
    });
    expect(viewOf(answer)).toBe("error");
  });
});
