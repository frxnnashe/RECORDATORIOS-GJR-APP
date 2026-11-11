import { workspaceAction } from '@/lib/model';
import { errorResponse, readJson, requestUser, RequestError } from '@/lib/server/http';
import { changeWorkspace, getWorkspace } from '@/lib/server/workspace';

export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    return Response.json(await getWorkspace(user.id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requestUser(request, true);
    const input = workspaceAction.safeParse(await readJson(request));
    if (!input.success) throw new RequestError('Revisá los datos antes de guardar.', 400);
    return Response.json(await changeWorkspace(user.id, input.data), {
      status: input.data.type.endsWith('.create') ? 201 : 200,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

