import { randomUUID } from 'node:crypto';
import type { Project, Task, TaskInput, WorkspaceAction } from '../model';
import { updateReminders } from '../reminder-rules';
import { database, type ProjectDoc, type TaskDoc } from './db';
import { RequestError } from './http';

export function serializeTask(doc: TaskDoc): Task {
  const { _id, ownerId, dueAt, createdAt, updatedAt, ...fields } = doc;
  void ownerId;
  return {
    ...fields,
    id: _id,
    dueAt: dueAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function serializeProject(doc: ProjectDoc): Project {
  return { id: doc._id, name: doc.name, color: doc.color, revision: doc.revision };
}

export async function getWorkspace(ownerId: string) {
  const { tasks, projects } = await database();
  const [taskDocs, projectDocs] = await Promise.all([
    tasks.find({ ownerId }).sort({ createdAt: -1 }).toArray(),
    projects.find({ ownerId }).sort({ createdAt: 1 }).toArray(),
  ]);
  return { tasks: taskDocs.map(serializeTask), projects: projectDocs.map(serializeProject) };
}

function taskFields(input: TaskInput, now: Date, previous?: TaskDoc) {
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const reminders = input.status === 'done' ? [] : updateReminders(input.reminders, dueAt, previous?.reminders ?? [], now);
  const oldIds = new Set(previous?.reminders.map((item) => item.id));
  if (reminders.some((item) => item.kind !== 'recurring' && !oldIds.has(item.id) && new Date(item.fireAt) <= now)) {
    throw new RequestError('La fecha de los nuevos avisos tiene que ser futura.', 400);
  }
  return { ...input, tags: [...new Set(input.tags)], dueAt, reminders, updatedAt: now };
}

function conflict(): never {
  throw new RequestError('El registro cambió o ya no está disponible. Actualizamos la vista.', 409);
}

export async function changeWorkspace(ownerId: string, action: WorkspaceAction) {
  const { tasks, projects } = await database();
  const now = new Date();

  switch (action.type) {
    case 'project.create': {
      const doc = { ...action.project, _id: randomUUID(), ownerId, createdAt: now, revision: 1 };
      await projects.insertOne(doc);
      return { project: serializeProject(doc) };
    }
    case 'project.update': {
      const doc = await projects.findOneAndUpdate(
        { _id: action.id, ownerId, revision: action.revision },
        { $set: action.project, $inc: { revision: 1 } },
        { returnDocument: 'after' },
      );
      if (!doc) conflict();
      return { project: serializeProject(doc) };
    }
    case 'task.delete': {
      const result = await tasks.deleteOne({ _id: action.id, ownerId, revision: action.revision });
      if (!result.deletedCount) conflict();
      return { deleted: action.id };
    }
    case 'task.move': {
      const doc = await tasks.findOneAndUpdate(
        { _id: action.id, ownerId, revision: action.revision },
        {
          $set: {
            status: action.status,
            updatedAt: now,
            ...(action.status === 'done' ? { reminders: [] } : {}),
          },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!doc) conflict();
      return { task: serializeTask(doc) };
    }
    case 'task.create':
    case 'task.update': {
      if (action.task.projectId && !await projects.findOne({ _id: action.task.projectId, ownerId }, { projection: { _id: 1 } })) {
        throw new RequestError('El proyecto seleccionado no está disponible.', 400);
      }
      if (action.type === 'task.create') {
        const doc = { ...taskFields(action.task, now), _id: randomUUID(), ownerId, createdAt: now, revision: 1 };
        await tasks.insertOne(doc);
        return { task: serializeTask(doc) };
      }
      const filter = { _id: action.id, ownerId, revision: action.revision };
      const previous = await tasks.findOne(filter);
      if (!previous) conflict();
      const doc = await tasks.findOneAndUpdate(
        filter,
        { $set: taskFields(action.task, now, previous), $inc: { revision: 1 } },
        { returnDocument: 'after' },
      );
      if (!doc) conflict();
      return { task: serializeTask(doc) };
    }
  }
}

