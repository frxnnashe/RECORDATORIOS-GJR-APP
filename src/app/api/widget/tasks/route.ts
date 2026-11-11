import { createHash } from 'node:crypto';
import { database } from '@/lib/server/db';
import { errorResponse, RequestError } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer ([\w-]{43})$/i)?.[1];
    if (!token) throw new RequestError('Vinculá el widget con Reminders GJR.', 401);
    const { widget, tasks, projects } = await database();
    const credential = await widget.findOne({ tokenHash: createHash('sha256').update(token).digest('hex') });
    if (!credential) throw new RequestError('La clave del widget caducó o fue revocada.', 401);

    const entries = await tasks.find({ ownerId: credential.ownerId, status: { $ne: 'done' } })
      .sort({ createdAt: -1 })
      .limit(4)
      .project<{ _id: string; title: string; dueAt: Date | null; projectId: string | null }>({ title: 1, dueAt: 1, projectId: 1 })
      .toArray();
    const projectIds = entries.flatMap((entry) => entry.projectId ? [entry.projectId] : []);
    const names = new Map((await projects.find({ _id: { $in: projectIds }, ownerId: credential.ownerId })
      .project<{ _id: string; name: string }>({ name: 1 }).toArray()).map((project) => [project._id, project.name]));

    return Response.json({
      tasks: entries.map((entry) => ({
        id: entry._id,
        title: entry.title,
        project: entry.projectId ? names.get(entry.projectId) ?? null : null,
        dueAt: entry.dueAt?.toISOString() ?? null,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

