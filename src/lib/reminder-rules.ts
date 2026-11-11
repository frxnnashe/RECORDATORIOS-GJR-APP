import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import type { Reminder, ReminderInput } from './model';

export class ReminderError extends Error {}

export function updateReminders(
  inputs: ReminderInput[], dueAt: Date | null, previous: Reminder[], now = new Date(),
): Reminder[] {
  const schedules = new Set<string>();
  return inputs.map((input) => {
    if (input.kind === 'relative' && !dueAt) {
      throw new ReminderError('Agregá un vencimiento para usar avisos relativos.');
    }

    const fireAt = input.kind === 'relative'
      ? new Date(dueAt!.getTime() - input.minutes * 60_000).toISOString()
      : new Date(input.at).toISOString();

    let scheduleKey = fireAt;
    if (input.kind === 'recurring') {
      const start = Temporal.Instant.from(fireAt).toZonedDateTimeISO(input.timeZone);
      if (input.until && input.until < start.toPlainDate().toString()) {
        throw new ReminderError('La fecha de fin debe coincidir con el inicio o ser posterior.');
      }
      scheduleKey = JSON.stringify([fireAt, input.unit, input.interval, input.timeZone, input.until]);
    }

    if (schedules.has(scheduleKey)) {
      throw new ReminderError('Ya hay un aviso para ese mismo horario.');
    }
    schedules.add(scheduleKey);

    const existing = previous.find((item) => {
      if (item.fireAt !== fireAt) return false;
      if (input.kind === 'fixed') return item.kind === 'fixed';
      if (input.kind === 'relative') return item.kind === 'relative' && item.minutes === input.minutes;
      return item.kind === 'recurring' && item.interval === input.interval && item.unit === input.unit
        && item.until === input.until && item.timeZone === input.timeZone;
    });

    const id = existing?.id ?? randomUUID();
    if (input.kind === 'relative') return { ...input, fireAt, id };
    if (input.kind === 'fixed') return { ...input, at: fireAt, fireAt, id };

    return {
      ...input,
      at: fireAt,
      fireAt,
      id,
      activatedAt: existing?.kind === 'recurring' ? existing.activatedAt : now.toISOString(),
    };
  });
}

const day = 86_400_000;
type RecurringReminder = Extract<Reminder, { kind: 'recurring' }>;

function occurrenceNear(reminder: RecurringReminder, reference: string, direction: 'past' | 'future') {
  const start = Temporal.Instant.from(reminder.fireAt).toZonedDateTimeISO(reminder.timeZone);
  const current = Temporal.Instant.from(reference).toZonedDateTimeISO(reminder.timeZone);
  const days = start.toPlainDate().until(current.toPlainDate()).days;
  const stepDays = reminder.unit === 'week' ? reminder.interval * 7 : reminder.interval;
  const months = (current.year - start.year) * 12 + current.month - start.month;
  let step = reminder.unit === 'month' ? Math.floor(months / reminder.interval) : Math.floor(days / stepDays);

  const atStep = (index: number) => reminder.unit === 'month'
    ? start.add({ months: index * reminder.interval })
    : start.add({ days: index * stepDays });

  if (direction === 'future') step = Math.max(0, step);
  let occurrence = atStep(step);
  const comparison = Temporal.ZonedDateTime.compare(occurrence, current);
  if (direction === 'past' && comparison > 0) occurrence = atStep(--step);
  if (direction === 'future' && comparison <= 0) occurrence = atStep(++step);
  if (step < 0 || (reminder.until && occurrence.toPlainDate().toString() > reminder.until)) return null;

  const fireAt = occurrence.toInstant().toString({ fractionalSecondDigits: 3 });
  return fireAt >= reminder.activatedAt ? fireAt : null;
}

export function latestOccurrence(reminder: Reminder, now: Date): string | null {
  const latest = now.toISOString();
  const earliest = new Date(now.getTime() - day).toISOString();
  if (reminder.fireAt > latest) return null;
  const fireAt = reminder.kind === 'recurring' ? occurrenceNear(reminder, latest, 'past') : reminder.fireAt;
  return fireAt && fireAt > earliest ? fireAt : null;
}

export function nextOccurrence(reminder: Reminder, now: Date): string | null {
  const reference = now.toISOString();
  if (reminder.kind !== 'recurring') return reminder.fireAt > reference ? reminder.fireAt : null;
  return occurrenceNear(reminder, reference, 'future');
}
