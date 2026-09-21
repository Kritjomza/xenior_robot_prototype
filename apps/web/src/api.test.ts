import { afterEach, expect, it, vi } from "vitest";
import { parseProgram, post } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['{"speed_mm_s":1e999}', '{"seconds":NaN}', '{"x_mm":Infinity}'])(
  "rejects non-finite editor input %s before JSON serialization",
  (source) => {
    expect(() => parseProgram(source)).toThrow("Invalid JSON");
  },
);

it("times out a lost response with an explicit warning against blindly retrying a run", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    (_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  const result = expect(post("runs", { version: 1 })).rejects.toThrow(
    "Request timed out. Check live state before retrying a run.",
  );
  await Promise.all([result, vi.advanceTimersByTimeAsync(10000)]);
});

it("reports non-JSON API failure bodies instead of a success", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("Proxy unavailable", { status: 502 })),
  );
  await expect(post("reset")).rejects.toThrow("API request failed (502)");
});
