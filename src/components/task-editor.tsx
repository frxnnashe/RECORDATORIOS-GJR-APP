'use client';

import { Bell, CalendarDays, Check, ListChecks, Mic, Plus, Repeat2, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import {
  priorities, priorityLabels, recurrenceUnits, statuses, statusLabels, type Project, type RecurrenceUnit, type ReminderInput,
  type Status, type Task, type TaskInput, type WorkspaceAction,
} from '@/lib/model';
import { errorMessage } from '@/lib/client-api';
import { Panel } from './panel';

type ReminderDraft = {
  key: string;
  kind: ReminderInput['kind'];
  minutes: number;
  date: string;
  interval?: number | '';
  unit?: RecurrenceUnit;
  timeZone?: string;
  until?: string;
  originalAt?: string;
};

const unitLabels = { day: 'Días', week: 'Semanas', month: 'Meses' };

function zonedDateTime(instant: string, timeZone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: 'minute' });
}

function reminderDraft(item: ReminderInput, key: string): ReminderDraft {
  const base = { key, kind: item.kind, minutes: 0, date: '' };
  if (item.kind === 'relative') return { ...base, minutes: item.minutes };
  if (item.kind === 'fixed') return { ...base, date: localDateTime(item.at) };
  return {
    ...base,
    date: zonedDateTime(item.at, item.timeZone),
    originalAt: item.at,
    interval: item.interval,
    unit: item.unit,
    timeZone: item.timeZone,
    until: item.until ?? '',
  };
}

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoDate(value: string) {
  return value ? new Date(value).toISOString() : null;
}

const reminderOptions = [
  [0, 'Al vencer'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 h antes'],
  [120, '2 h antes'], [1440, '24 h antes'], [2880, '2 días antes'], [4320, '3 días antes'], [10080, '7 días antes'],
] as const;

export function TaskEditor({ task, projects, defaultProject, defaultStatus, startWithDictation, onClose, onSave }: {
  task?: Task; projects: Project[]; defaultProject: string | null; defaultStatus: Status;
  startWithDictation?: boolean; onClose: () => void; onSave: (action: WorkspaceAction) => Promise<void>;
}) {
  const [dueAt, setDueAt] = useState(localDateTime(task?.dueAt ?? null));
  const [status, setStatus] = useState(task?.status ?? defaultStatus);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [projectId, setProjectId] = useState(task ? task.projectId ?? '' : defaultProject ?? '');
  const [priority, setPriority] = useState<TaskInput['priority']>(task?.priority ?? 'normal');
  const [showDictation, setShowDictation] = useState(Boolean(startWithDictation));
  const [transcript, setTranscript] = useState('');
  const [dictationNotice, setDictationNotice] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [checklist, setChecklist] = useState(task?.checklist ?? []);
  const [checklistText, setChecklistText] = useState('');
  const [reminders, setReminders] = useState<ReminderDraft[]>(() => task?.reminders.map((item) => reminderDraft(item, item.id)) ?? []);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  function addCheck() {
    const title = checklistText.trim();
    if (!title || checklist.length >= 30) return;
    setChecklist([...checklist, { id: crypto.randomUUID(), title, done: false }]);
    setChecklistText('');
  }

  function addReminder() {
    if (reminders.length >= 10) return;
    const minutes = reminderOptions.find(([value]) => !reminders.some((item) => item.kind === 'relative' && item.minutes === value))?.[0];
    const relative = dueAt && minutes !== undefined;
    setReminders([...reminders, { key: crypto.randomUUID(), kind: relative ? 'relative' : 'fixed', minutes: minutes ?? 0, date: '' }]);
  }

  function updateReminder(key: string, fields: Partial<ReminderDraft>) {
    setReminders((items) => items.map((item) => item.key === key ? { ...item, ...fields } : item));
  }

  async function perform(action: WorkspaceAction) {
    setBusy(true);
    setError('');
    try {
      await onSave(action);
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyDictation() {
    setDictationNotice('');
    setInterpreting(true);
    try {
      const { interpretTask } = await import('@/lib/dictation');
      const result = interpretTask(transcript, projects, new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
      const warnings = [...result.warnings];
      if (result.title.length > 160) warnings.push('Acortá el título a 160 caracteres.');
      else if (result.title) setTitle(result.title);
      else if (!title.trim()) warnings.push('Completá el título antes de guardar.');
      if (result.description !== undefined) setDescription(result.description);
      if (result.projectId) setProjectId(result.projectId);
      if (result.priority) setPriority(result.priority);
      if (result.dueAt) setDueAt(localDateTime(result.dueAt));

      const next = [...reminders];
      for (const suggestion of result.reminders) {
        const candidate = reminderDraft(suggestion, crypto.randomUUID());
        const duplicate = next.some((item) =>
          item.kind === candidate.kind && item.date === candidate.date && item.minutes === candidate.minutes
            && item.interval === candidate.interval && item.unit === candidate.unit && item.until === candidate.until
            && item.timeZone === candidate.timeZone,
        );
        if (duplicate) continue;
        if (next.length >= 10) {
          warnings.push('La tarea admite hasta diez avisos.');
          break;
        }
        next.push(candidate);
      }
      setReminders(next);
      setDictationNotice(['Revisá los campos y guardá la tarea.', ...warnings].join(' '));
      setShowDictation(false);
    } catch {
      setDictationNotice('No pudimos interpretar la frase. Podés editarla o completar la tarea.');
    } finally {
      setInterpreting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!title.trim()) {
      setError('Escribí un título para la tarea.');
      return;
    }
    const tags = String(form.get('tags')).split(',').map((item) => item.trim()).filter(Boolean);
    if (tags.length > 8 || tags.some((item) => item.length > 32)) {
      setError('Usá hasta ocho etiquetas de 32 caracteres cada una.');
      return;
    }

    const schedules: ReminderInput[] = [];
    for (const reminder of status === 'done' ? [] : reminders) {
      if (reminder.kind === 'relative') {
        schedules.push({ kind: 'relative', minutes: reminder.minutes });
      } else if (!reminder.date) {
        setError('Elegí fecha y hora para cada aviso.');
        return;
      } else if (reminder.kind === 'fixed') {
        schedules.push({ kind: 'fixed', at: isoDate(reminder.date)! });
      } else {
        const timeZone = reminder.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const unchanged = reminder.originalAt && zonedDateTime(reminder.originalAt, timeZone) === reminder.date;
        const at = unchanged ? reminder.originalAt! : Temporal.PlainDateTime.from(reminder.date)
          .toZonedDateTime(timeZone).toInstant().toString();
        schedules.push({
          kind: 'recurring', at, timeZone, interval: reminder.interval || 1, unit: reminder.unit ?? 'day', until: reminder.until || null,
        });
      }
    }

    const input: TaskInput = {
      title: title.trim(),
      description,
      projectId: projectId || null,
      status,
      priority,
      dueAt: isoDate(dueAt),
      tags,
      checklist: checklistText.trim() && checklist.length < 30
        ? [...checklist, { id: crypto.randomUUID(), title: checklistText.trim(), done: false }]
        : checklist,
      reminders: schedules,
    };
    void perform(task
      ? { type: 'task.update', id: task.id, revision: task.revision, task: input }
      : { type: 'task.create', task: input });
  }

  return <Panel title={task ? 'Editar tarea' : 'Nueva tarea'} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={submit} className="editor-form">
      <div className="panel-content">
        {!task && <div className="dictation">
          <button type="button" className="button secondary" aria-expanded={showDictation}
            onClick={() => setShowDictation(!showDictation)}><Mic size={16} /> Dictar tarea</button>
          {showDictation && <div className="dictation-input">
            <label>Frase de la tarea
              <textarea rows={3} maxLength={1200} autoFocus={startWithDictation} value={transcript} onChange={(event) => setTranscript(event.target.value)}
                placeholder="Hola, cargá un recordatorio para mañana. Título: Revisar el formulario. Avisame cada dos días a las nueve." />
            </label>
            <p className="field-hint">Usá el micrófono del teclado del iPhone o escribí la frase.</p>
            <button type="button" className="button primary" disabled={interpreting || !transcript.trim()}
              onClick={() => void applyDictation()}>{interpreting ? 'Interpretando…' : 'Interpretar dictado'}</button>
          </div>}
          {dictationNotice && <p className="callout" role="status">{dictationNotice}</p>}
        </div>}
        <label>Título<input name="title" maxLength={160} required value={title}
          onChange={(event) => setTitle(event.target.value)} placeholder="¿Qué necesitás hacer?" /></label>
        <label>Descripción<textarea name="description" rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Agregá detalles o próximos pasos" /></label>
        <div className="field-row project-fields">
          <label>Proyecto<select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Bandeja de entrada</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>Prioridad<select name="priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskInput['priority'])}>
            {priorities.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}
          </select></label>
        </div>
        <div className="field-row status-fields">
          <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as Status)}>
            {statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
          </select></label>
          <label><span className="label-icon"><CalendarDays size={15} /> Vencimiento</span>
            <input type="datetime-local" value={dueAt} onChange={(event) => {
              setDueAt(event.target.value);
              if (!event.target.value) setReminders((items) => items.filter((item) => item.kind !== 'relative'));
            }} />
          </label>
        </div>
        <label>Etiquetas<input name="tags" defaultValue={task?.tags.join(', ')} placeholder="frontend, cliente, revisión" /></label>

        <section className="editor-section">
          <h3><ListChecks size={17} /> Checklist</h3>
          {checklist.map((item) => <div className="checklist-item" key={item.id}>
            <label className={item.done ? 'checked' : ''}>
              <input type="checkbox" checked={item.done} onChange={(event) => {
                setChecklist(checklist.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry));
              }} /> {item.title}
            </label>
            <button type="button" className="icon-button" aria-label={'Quitar ' + item.title}
              onClick={() => setChecklist(checklist.filter((entry) => entry.id !== item.id))}><X size={15} /></button>
          </div>)}
          {checklist.length < 30 && <div className="inline-field">
            <input value={checklistText} onChange={(event) => setChecklistText(event.target.value)}
              aria-label="Nuevo paso del checklist" maxLength={160} placeholder="Añadí un paso" onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); addCheck(); }
              }} />
            <button className="button secondary" type="button" onClick={addCheck} disabled={!checklistText.trim()} aria-label="Agregar paso"><Plus size={17} /></button>
          </div>}
        </section>

        <section className="editor-section">
          <div className="section-line">
            <h3><Bell size={16} /> Recordatorios</h3>
            {status !== 'done' && reminders.length < 10 && <button type="button" className="text-button" onClick={addReminder}><Plus size={15} /> Añadir aviso</button>}
          </div>
          {status === 'done' && <p className="muted">Al guardar una tarea hecha se cancelan sus avisos.</p>}
          {status !== 'done' && reminders.length === 0 && <p className="muted">Programá un aviso puntual o elegí cada cuánto repetirlo.</p>}
          {status !== 'done' && reminders.map((item, index) => {
            const number = index + 1;
            return <div className={item.kind === 'recurring' ? 'recurring-reminder' : undefined} key={item.key}>
              <div className={'reminder-row' + (item.kind === 'fixed' ? ' fixed-reminder' : '')}>
                <select aria-label={'Tipo de aviso ' + number} value={item.kind === 'relative' ? item.minutes : item.kind}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === 'recurring') {
                      updateReminder(item.key, {
                        kind: 'recurring', interval: item.interval ?? 1, unit: item.unit ?? 'day',
                        timeZone: item.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                      });
                    } else if (value === 'fixed') {
                      updateReminder(item.key, { kind: 'fixed' });
                    } else {
                      updateReminder(item.key, { kind: 'relative', minutes: Number(value) });
                    }
                  }}>
                  {dueAt && reminderOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  {dueAt && item.kind === 'relative' && !reminderOptions.some(([value]) => value === item.minutes)
                    && <option value={item.minutes}>{item.minutes} min antes</option>}
                  <option value="fixed">Una sola vez</option>
                  <option value="recurring">Repetir…</option>
                </select>
                {item.kind === 'fixed' && <input aria-label={'Fecha del aviso ' + number} type="datetime-local" required
                  value={item.date} onChange={(event) => updateReminder(item.key, { date: event.target.value })} />}
                <button type="button" className="icon-button" aria-label={'Quitar aviso ' + number}
                  onClick={() => setReminders(reminders.filter((entry) => entry.key !== item.key))}><X size={16} /></button>
              </div>
              {item.kind === 'recurring' && <div className="repeat-fields">
                <label>Primer aviso
                  <input type="datetime-local" required value={item.date}
                    onChange={(event) => updateReminder(item.key, { date: event.target.value })} />
                </label>
                <div className="repeat-interval">
                  <label><span className="label-icon"><Repeat2 size={15} /> Cada</span>
                    <input type="number" min={1} max={365} step={1} required value={item.interval ?? 1}
                      onChange={(event) => updateReminder(item.key, { interval: event.target.value === '' ? '' : Number(event.target.value) })} />
                  </label>
                  <label>Unidad
                    <select value={item.unit ?? 'day'} onChange={(event) => updateReminder(item.key, { unit: event.target.value as RecurrenceUnit })}>
                      {recurrenceUnits.map((unit) => <option key={unit} value={unit}>{unitLabels[unit]}</option>)}
                    </select>
                  </label>
                </div>
                <label><span>Hasta <small className="muted">Opcional</small></span>
                  <input type="date" min={item.date.slice(0, 10) || undefined} value={item.until ?? ''}
                    onChange={(event) => updateReminder(item.key, { until: event.target.value })} />
                </label>
              </div>}
            </div>;
          })}
        </section>


      </div>
      <footer className="panel-footer">
        {error && <p className="form-error" role="alert">{error}</p>}
        {confirmDelete && task ? <div className="delete-confirm">
          <p>¿Eliminar esta tarea y sus recordatorios?</p>
          <button type="button" className="button danger" disabled={busy} onClick={() => void perform({ type: 'task.delete', id: task.id, revision: task.revision })}>Eliminar tarea</button>
          <button type="button" className="button secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
        </div> : <div className="footer-actions">
          {task && <button type="button" aria-label="Eliminar tarea" className="icon-button delete-button" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 size={18} /></button>}
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy}><Check size={17} /> {busy ? 'Guardando…' : 'Guardar tarea'}</button>
        </div>}
      </footer>
    </form>
  </Panel>;
}

