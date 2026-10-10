const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export const apiBaseUrl = configuredApiUrl ?? "http://127.0.0.1:8000/api/v1";
export const restaurantId = Number(process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "1");

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError("TableFlow is temporarily unavailable. Please try again shortly.", 0);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(payload?.detail ?? "We could not complete that request.", response.status);
  }

  return response.json() as Promise<T>;
}
