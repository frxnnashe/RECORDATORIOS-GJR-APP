import { createHash } from 'node:crypto';
import { nextOccurrence } from '@/lib/reminder-rules';
import { database, type TaskDoc } from '@/lib/server/db';
import { errorResponse, RequestError } from '@/lib/server/http';

type WidgetEntry = Pick<TaskDoc, '_id' | 'title' | 'dueAt' | 'projectId' | 'reminders' | 'priority' | 'createdAt'>;

export async function GET(request: Request) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer ([\w-]{43})$/i)?.[1];
    if (!token) throw new RequestError('Vinculá el widget con Reminders GJR.', 401);
    const { widget, tasks, projects } = await database();
    const credential = await widget.findOne({ tokenHash: createHash('sha256').update(token).digest('hex') });
    if (!credential) throw new RequestError('La clave del widget caducó o fue revocada.', 401);

    const entries = await tasks.find({ ownerId: credential.ownerId, status: { $ne: 'done' } })
      .sort({ createdAt: -1 })
      .project<WidgetEntry>({ title: 1, dueAt: 1, projectId: 1, reminders: 1, priority: 1, createdAt: 1 })
      .toArray();
    const now = new Date();
    const sorted = entries.map((task) => {
      const nextReminderAt = task.reminders.map((reminder) => nextOccurrence(reminder, now))
        .filter((date): date is string => date !== null).sort()[0] ?? null;
      const futureDue = task.dueAt && task.dueAt > now ? task.dueAt.toISOString() : null;
      const upcoming = [nextReminderAt, futureDue].filter(Boolean).sort()[0] ?? null;
      return { task, nextReminderAt, upcoming };
    }).sort((a, b) => {
      if (a.upcoming && b.upcoming) return a.upcoming.localeCompare(b.upcoming);
      if (a.upcoming || b.upcoming) return a.upcoming ? -1 : 1;
      if (a.task.dueAt && b.task.dueAt) return b.task.dueAt.getTime() - a.task.dueAt.getTime();
      if (a.task.dueAt || b.task.dueAt) return a.task.dueAt ? -1 : 1;
      return b.task.createdAt.getTime() - a.task.createdAt.getTime();
    });
    const visible = sorted.slice(0, 8);
    const projectIds = visible.flatMap(({ task }) => task.projectId ? [task.projectId] : []);
    const names = new Map((await projects.find({ _id: { $in: projectIds }, ownerId: credential.ownerId })
      .project<{ _id: string; name: string }>({ name: 1 }).toArray()).map((project) => [project._id, project.name]));

    return Response.json({
      totalPending: entries.length,
      generatedAt: now.toISOString(),
      tasks: visible.map(({ task, nextReminderAt }) => ({
        id: task._id,
        title: task.title,
        project: task.projectId ? names.get(task.projectId) ?? null : null,
        dueAt: task.dueAt?.toISOString() ?? null,
        priority: task.priority,
        nextReminderAt,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
