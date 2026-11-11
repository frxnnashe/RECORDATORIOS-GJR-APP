export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(json.error ?? 'No pudimos completar la acción.', response.status);
  return json as T;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'No pudimos conectar. Probá de nuevo.';
}

