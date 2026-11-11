import { MongoServerError } from 'mongodb';
import { auth } from './auth';
import { ReminderError } from '../reminder-rules';

export class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function requestUser(request: Request, write = false) {
  if (write && request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL!).origin) {
    throw new RequestError('Origen inválido.', 403);
  }
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) throw new RequestError('Tu sesión terminó. Volvé a ingresar.', 401);
  return session.user;
}

export async function readJson(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.length > 32_000) throw new RequestError('La solicitud supera el tamaño permitido.', 413);
  try {
    return JSON.parse(body);
  } catch {
    throw new RequestError('La solicitud contiene datos inválidos.', 400);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof RequestError || error instanceof ReminderError) {
    return Response.json({ error: error.message }, { status: error instanceof RequestError ? error.status : 400 });
  }
  if (error instanceof MongoServerError && error.code === 11000) {
    return Response.json({ error: 'Ya existe un registro con esos datos.' }, { status: 409 });
  }
  console.error('Reminders GJR:', error instanceof Error ? error.name : 'Error desconocido');
  return Response.json({ error: 'El servicio no está disponible. Probá de nuevo.' }, { status: 503 });
}

