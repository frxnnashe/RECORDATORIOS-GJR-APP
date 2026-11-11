'use client';

import { Bell, CalendarDays, CheckCircle2, ChevronDown, ListChecks } from 'lucide-react';
import { isOverdue, statuses, statusLabels, type Project, type Status, type Task } from '@/lib/model';

const shortDate = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });

export function TaskCard({ task, project, now, list, busy, onOpen, onMove, onDrag }: {
  task: Task; project?: Project; now: Date | null; list?: boolean; busy: boolean;
  onOpen: () => void; onMove: (status: Status) => void; onDrag: (id: string | null) => void;
}) {
  const done = task.checklist.filter((item) => item.done).length;
  const overdue = now ? isOverdue(task, now) : false;
  const hasDetails = !!(task.dueAt || task.reminders.length || task.checklist.length);

  return <article className={'task-card' + (list ? ' task-list-card' : '')} data-status={task.status}
    draggable={!list && !busy}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', task.id);
      onDrag(task.id);
    }}
    onDragEnd={() => onDrag(null)}>
    <div className="task-top">
      <div className="task-project" data-color={project?.color}>
        <span className="project-dot" /> {project?.name ?? 'Bandeja de entrada'}
      </div>
      <div className="quick-status">
        {task.status === 'done' ? <CheckCircle2 size={17} /> : <ChevronDown size={16} />}
        <select aria-label={'Estado de ' + task.title} value={task.status} onChange={(event) => onMove(event.target.value as Status)} disabled={busy}>
          {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
      </div>
    </div>
    <button type="button" className="task-title" onClick={onOpen}>{task.title}</button>
    {task.description && <p className="task-description">{task.description}</p>}
    {(task.priority !== 'normal' || task.tags.length > 0) && <div className="task-tags">
      {task.priority !== 'normal' && <span className={'priority priority-' + task.priority}>{task.priority === 'high' ? 'Alta' : 'Baja'}</span>}
      {task.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
      {task.tags.length > 3 && <span className="tag">+{task.tags.length - 3}</span>}
    </div>}
    {hasDetails && <div className="task-meta">
      {task.dueAt && <span className={overdue ? 'overdue' : ''}>
        <CalendarDays size={14} /> <time dateTime={task.dueAt}>{now ? shortDate.format(new Date(task.dueAt)) : 'Vencimiento'}</time>
        {overdue && <span className="sr-only">Vencida</span>}
      </span>}
      {task.checklist.length > 0 && <span title="Checklist"><ListChecks size={15} /> {done}/{task.checklist.length}</span>}
      {task.reminders.length > 0 && <span title="Recordatorios"><Bell size={14} /> {task.reminders.length}</span>}
    </div>}
  </article>;
}

