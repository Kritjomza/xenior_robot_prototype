let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

function describeError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = body.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
      return detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const location = Array.isArray(item.loc)
              ? item.loc.join(".")
              : "program";
            return `${location}: ${String(item.msg)}`;
          }
          return "Invalid program";
        })
        .join("\n");
  }
  return `API request failed (${status})`;
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api/v1/${path}`, {
      method: "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(describeError(data, response.status));
    if (data === null) throw new Error("API returned an invalid response");
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "Request timed out. Check live state before retrying a run.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseProgram(source: string): unknown {
  try {
    // JSON data only. The server validates the entire program before execution.
    // Reject overflow before stringify can silently convert Infinity to null.
    return JSON.parse(source, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error("Numbers must be finite");
      }
      return value;
    }) as unknown;
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${error instanceof Error ? error.message : "check the syntax"}`,
    );
  }
}
