import { z } from 'zod';

export const statuses = ['pending', 'progress', 'review', 'done'] as const;
export const priorities = ['low', 'normal', 'high'] as const;
export const projectColors = ['indigo', 'teal', 'rose', 'amber', 'blue'] as const;

export const statusLabels = {
  pending: 'Pendiente',
  progress: 'En curso',
  review: 'En revisión',
  done: 'Hecha',
};

export const priorityLabels = { low: 'Baja', normal: 'Normal', high: 'Alta' };
export const colorLabels = { indigo: 'Índigo', teal: 'Verde', rose: 'Rosa', amber: 'Ámbar', blue: 'Azul' };

export const recurrenceUnits = ['day', 'week', 'month'] as const;

export const reminderInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('relative'), minutes: z.number().int().min(0).max(43200) }),
  z.object({ kind: z.literal('fixed'), at: z.iso.datetime({ offset: true }) }),
  z.object({
    kind: z.literal('recurring'),
    at: z.iso.datetime({ offset: true }),
    interval: z.number().int().min(1).max(365),
    unit: z.enum(recurrenceUnits),
    timeZone: z.string().max(64).refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return !/^[+-]/.test(zone);
      } catch {
        return false;
      }
    }),
    until: z.iso.date().nullable(),
  }),
]);

export const taskInput = z.object({
  title: z.string().trim().min(1, 'Escribí un título.').max(160),
  description: z.string().trim().max(5000),
  projectId: z.uuid().nullable(),
  status: z.enum(statuses),
  priority: z.enum(priorities),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(8),
  checklist: z.array(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(160), done: z.boolean() })).max(30),
  reminders: z.array(reminderInput).max(10),
});

export const projectInput = z.object({
  name: z.string().trim().min(1, 'Escribí el nombre del proyecto.').max(64),
  color: z.enum(projectColors),
});

const record = { id: z.uuid(), revision: z.number().int().positive() };
export const workspaceAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task.create'), task: taskInput }),
  z.object({ type: z.literal('task.update'), ...record, task: taskInput }),
  z.object({ type: z.literal('task.move'), ...record, status: z.enum(statuses) }),
  z.object({ type: z.literal('task.delete'), ...record }),
  z.object({ type: z.literal('project.create'), project: projectInput }),
  z.object({ type: z.literal('project.update'), ...record, project: projectInput }),
]);

export type Status = (typeof statuses)[number];
export type ReminderInput = z.infer<typeof reminderInput>;
type ReminderMetadata = { id: string; fireAt: string };
export type Reminder = (Exclude<ReminderInput, { kind: 'recurring' }> & ReminderMetadata)
  | (Extract<ReminderInput, { kind: 'recurring' }> & ReminderMetadata & { activatedAt: string });
export type RecurrenceUnit = (typeof recurrenceUnits)[number];
export type TaskInput = z.infer<typeof taskInput>;
export type ProjectInput = z.infer<typeof projectInput>;
export type WorkspaceAction = z.infer<typeof workspaceAction>;

export type Task = Omit<TaskInput, 'reminders'> & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  reminders: Reminder[];
};

export type Project = ProjectInput & { id: string; revision: number };
export type Workspace = { tasks: Task[]; projects: Project[] };

export function isOverdue(task: Task, now: Date) {
  return task.status !== 'done' && !!task.dueAt && new Date(task.dueAt) < now;
}

