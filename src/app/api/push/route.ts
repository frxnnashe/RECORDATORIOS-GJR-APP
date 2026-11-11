import { errorResponse, readJson, requestUser, RequestError } from '@/lib/server/http';
import { changePush, pushInput } from '@/lib/server/push';

export async function POST(request: Request) {
  try {
    const user = await requestUser(request, true);
    const input = pushInput.safeParse(await readJson(request));
    if (!input.success) throw new RequestError('La suscripción de este navegador no es válida.', 400);
    const result = await changePush(user.id, input.data);
    return Response.json(result ?? { ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

