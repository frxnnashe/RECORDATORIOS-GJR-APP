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

export function latestOccurrence(reminder: Reminder, now: Date): string | null {
  const latest = now.toISOString();
  const earliest = new Date(now.getTime() - day).toISOString();
  if (reminder.fireAt > latest) return null;
  if (reminder.kind !== 'recurring') return reminder.fireAt > earliest ? reminder.fireAt : null;

  const zone = reminder.timeZone;
  const start = Temporal.Instant.from(reminder.fireAt).toZonedDateTimeISO(zone);
  const current = Temporal.Instant.from(latest).toZonedDateTimeISO(zone);
  const days = start.toPlainDate().until(current.toPlainDate()).days;
  const stepDays = reminder.unit === 'week' ? reminder.interval * 7 : reminder.interval;
  const months = (current.year - start.year) * 12 + current.month - start.month;
  let step = reminder.unit === 'month' ? Math.floor(months / reminder.interval) : Math.floor(days / stepDays);

  const atStep = (index: number) => reminder.unit === 'month'
    ? start.add({ months: index * reminder.interval })
    : start.add({ days: index * stepDays });

  let occurrence = atStep(step);
  if (Temporal.ZonedDateTime.compare(occurrence, current) > 0) occurrence = atStep(--step);
  if (step < 0 || (reminder.until && occurrence.toPlainDate().toString() > reminder.until)) return null;

  const fireAt = occurrence.toInstant().toString({ fractionalSecondDigits: 3 });
  return fireAt > earliest && fireAt >= reminder.activatedAt ? fireAt : null;
}

