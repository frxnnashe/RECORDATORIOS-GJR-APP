import { Temporal } from '@js-temporal/polyfill';
import { parse } from 'chrono-node/es';
import type { Project, RecurrenceUnit, ReminderInput, TaskInput } from './model';

type Draft = {
  title: string;
  description?: string;
  projectId?: string;
  priority?: TaskInput['priority'];
  dueAt?: string;
  reminders: ReminderInput[];
  warnings: string[];
};

const numbers = [
  '', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once',
  'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidos', 'veintitres',
];

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function number(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const word = fold(value);
  if (word === 'uno' || word === 'un') return 1;
  return numbers.indexOf(word);
}

const clockPattern = /\b(?:a\s+)?(?:las?|la)\s+(\d{1,2}|[\p{L}]+)(?::(\d{2}))?(?:\s+y\s+(media|cuarto))?(?:\s*(a\.?m\.?|p\.?m\.?|de la (?:mañana|tarde|noche)))?(?=$|[\s,;.!?])/iu;

function extractClock(value: string) {
  const found = value.match(clockPattern);
  if (!found) return { text: value.trim() };
  let hour = number(found[1]);
  const minutes = found[2] ? Number(found[2]) : found[3]?.toLowerCase() === 'media' ? 30 : found[3] ? 15 : 0;
  const period = found[4]?.toLowerCase().replaceAll('.', '');
  if (period) {
    if (hour < 1 || hour > 12) return { text: value, invalid: true };
    hour %= 12;
    if (period === 'pm' || period.endsWith('tarde') || period.endsWith('noche')) hour += 12;
  }
  if (hour < 0 || hour > 23 || minutes > 59) return { text: value, invalid: true };
  return { text: value.replace(found[0], ' ').trim(), hour, minutes };
}

function dateFromText(value: string, now: Temporal.ZonedDateTime) {
  const clean = value.trim().replace(/^(?:el|la)\s+/iu, '').replace(/[.?!]+$/u, '').trim();
  if (!clean) return undefined;
  if (fold(clean) === 'pasado manana') return now.toPlainDate().add({ days: 2 });
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    try { return Temporal.PlainDate.from(clean); } catch { return undefined; }
  }
  if (/^\d{1,2}$/.test(clean)) {
    const day = Number(clean);
    if (day < 1 || day > 31) return undefined;
    const today = now.toPlainDate();
    for (let offset = 0; offset < 3; offset++) {
      const month = today.with({ day: 1 }).add({ months: offset });
      if (month.daysInMonth < day) continue;
      const date = month.with({ day });
      if (Temporal.PlainDate.compare(date, today) >= 0) return date;
    }
  }
  const parsed = parse(clean, { instant: new Date(now.epochMilliseconds), timezone: now.offsetNanoseconds / 60_000_000_000 }, { forwardDate: true });
  if (parsed.length !== 1 || (!parsed[0].start.isCertain('day') && !parsed[0].start.isCertain('weekday'))) return undefined;
  const result = parsed[0];
  if (clean.slice(0, result.index).trim() || clean.slice(result.index + result.text.length).trim()) return undefined;
  return Temporal.PlainDate.from({
    year: result.start.get('year')!, month: result.start.get('month')!, day: result.start.get('day')!,
  }, { overflow: 'reject' });
}

function dateTime(date: Temporal.PlainDate, timeZone: string, hour: number, minute: number) {
  return date.toPlainDateTime({ hour, minute }).toZonedDateTime(timeZone);
}

function iso(value: Temporal.ZonedDateTime) {
  return value.toInstant().toString({ fractionalSecondDigits: 3 });
}

function readDateTime(text: string, now: Temporal.ZonedDateTime, defaultHour: number, defaultMinute: number) {
  const clock = extractClock(text.trim());
  if (clock.invalid) return undefined;
  const date = dateFromText(clock.text, now);
  if (clock.text && !date) return undefined;
  if (!date && clock.hour === undefined) return undefined;

  const timeZone = now.timeZoneId;
  let result = dateTime(date ?? now.toPlainDate(), timeZone, clock.hour ?? defaultHour, clock.minutes ?? defaultMinute);
  if (!date && Temporal.ZonedDateTime.compare(result, now) <= 0) {
    result = dateTime(now.toPlainDate().add({ days: 1 }), timeZone, clock.hour!, clock.minutes!);
  }
  return result;
}

function recurrence(text: string, now: Temporal.ZonedDateTime): ReminderInput | undefined {
  const direct = text.match(/^(?:d[ií]a por medio|d[ií]as alternos|todos? los d[ií]as|todas? las semanas|todos? los meses|diari[oa]s?|semanal(?:mente)?|mensual(?:mente)?|una vez (?:al|por) (?:d[ií]a|semana|mes))(?=\s|$)/iu);
  const custom = text.match(/^cada\s+(\d+|[\p{L}]+)\s+(d[ií]as?|semanas?|mes(?:es)?)(?=\s|$)/iu);
  const every = text.match(/^cada\s+(d[ií]a|semana|mes)(?=\s|$)/iu);
  const label = custom?.[2] ?? every?.[1] ?? direct?.[0];
  if (!label) return undefined;

  const interval = custom ? number(custom[1]) : /por medio|alternos/iu.test(label) ? 2 : 1;
  if (interval < 1 || interval > 365) return undefined;
  const unit: RecurrenceUnit = /seman/iu.test(label) ? 'week' : /mes|mensual/iu.test(label) ? 'month' : 'day';
  let remaining = text.slice((custom ?? every ?? direct)![0].length).trim();
  const untilMatch = remaining.match(/\bhasta\s+(.+)$/iu);
  const until = untilMatch ? dateFromText(untilMatch[1], now) : undefined;
  if (untilMatch && !until) return undefined;
  if (untilMatch) remaining = remaining.slice(0, untilMatch.index).trim();
  const clock = extractClock(remaining);
  if (clock.invalid) return undefined;
  const from = clock.text.match(/^desde\s+(.+)$/iu);
  if (clock.text && !from) return undefined;
  const specifiedStart = from ? dateFromText(from[1], now) : undefined;
  if (from && !specifiedStart) return undefined;

  let start = dateTime(specifiedStart ?? now.toPlainDate(), now.timeZoneId, clock.hour ?? 9, clock.minutes ?? 0);
  if (!specifiedStart && Temporal.ZonedDateTime.compare(start, now) <= 0) start = start.add({ days: 1 });
  if (until && Temporal.PlainDate.compare(until, start.toPlainDate()) < 0) return undefined;
  return { kind: 'recurring', at: iso(start), interval, unit, timeZone: now.timeZoneId, until: until?.toString() ?? null };
}

function withoutReminderLabel(text: string) {
  return text.replace(/^(?:con\s+)?(?:recordatorios?|avisos?|av[ií]same|recordame|recu[eé]rdame)\s*/iu, '').trim();
}

function readReminder(text: string, now: Temporal.ZonedDateTime) {
  const clean = withoutReminderLabel(text);
  const relative = clean.match(/^(\d+|[\p{L}]+)\s+(minutos?|horas?|d[ií]as?)\s+antes(?:\s+del vencimiento)?$/iu);
  if (relative) {
    const units = fold(relative[2]);
    const minutes = number(relative[1]) * (units.startsWith('dia') ? 1440 : units.startsWith('hora') ? 60 : 1);
    return minutes > 0 && minutes <= 43_200 ? { kind: 'relative', minutes } as const : undefined;
  }
  if (/^(?:al (?:vencer|vencimiento)|a la hora del vencimiento)$/iu.test(clean)) return { kind: 'relative', minutes: 0 } as const;
  if (/^(?:la v[ií]spera|el d[ií]a (?:previo|anterior))(?: del vencimiento)?$/iu.test(clean)) return { kind: 'relative', minutes: 1440 } as const;
  const repeating = recurrence(clean, now);
  if (repeating) return repeating;
  const fixed = readDateTime(clean.replace(/^para\s+/iu, ''), now, 9, 0);
  return fixed && Temporal.ZonedDateTime.compare(fixed, now) > 0 ? { kind: 'fixed', at: iso(fixed) } as const : undefined;
}

function withoutIntroduction(value: string) {
  const greeting = /^(?:(?:hola|buen(?:os d[ií]as|as tardes|as noches)|por favor)[,;:.!\s]+)+/iu;
  const request = /^(?:(?:necesito|quiero|me gustar[ií]a|te pido)\s+(?:que\s+)?(?:me\s+)?|(?:me\s+pod[eé]s|pod[eé]s|puedes)\s+)/iu;
  const action = /^(?:(?:carg(?:a|á|ues|ar)|cre(?:a|á|es|ar)|pon(?:é|e|gas|er)?|anot(?:a|á|es|ar)|agreg(?:a|á|ues|ar)|agend(?:a|á|es|ar)|hac(?:e|é|er)|program(?:a|á|es|ar)|a[ñn]ad(?:e|í|as|ir))(?:me)?\s+(?:me\s+)?(?:(?:un|una|el|la)\s+)?(?:recordatorio|tarea|aviso)\b|(?:recu[eé]rdame|recordame)\b)(?:\s*[:;,]\s*|\s+|$)/iu;
  const title = /^(?:(?:con|de)\s+)?(?:el\s+)?(?:t[ií]tulo|titulado|llamado)\s*(?::\s*|\s+)/iu;
  return value.replace(greeting, '').replace(request, '').replace(action, '').replace(title, '').trim();
}

const weekdays = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function weekdayReminders(text: string, now: Temporal.ZonedDateTime): ReminderInput[] | undefined {
  const clean = withoutReminderLabel(text);
  const end = clean.match(/\bhasta\s+(.+)$/iu);
  const until = end ? dateFromText(end[1], now) : undefined;
  if (end && !until) return undefined;
  const clock = extractClock(end ? clean.slice(0, end.index) : clean);
  if (clock.invalid) return undefined;
  const days = fold(clock.text);
  const workingWeek = /^de lunes a viernes$/.test(days);
  const named = days.match(/^(?:todos los |los |cada )(.+)$/);
  if (!workingWeek && !named) return undefined;
  const requested = workingWeek ? weekdays.slice(0, 5) : named![1].split(/\s*(?:,|\by\b)\s*/);
  const indices = requested.map((value) => weekdays.indexOf(value));
  if (!indices.length || indices.some((value) => value < 0)) return undefined;

  return [...new Set(indices)].flatMap((weekday) => {
    const daysUntil = (weekday + 1 - now.dayOfWeek + 7) % 7;
    let start = dateTime(now.toPlainDate().add({ days: daysUntil }), now.timeZoneId, clock.hour ?? 9, clock.minutes ?? 0);
    if (Temporal.ZonedDateTime.compare(start, now) <= 0) start = start.add({ weeks: 1 });
    if (until && Temporal.PlainDate.compare(until, start.toPlainDate()) < 0) return [];
    return [{ kind: 'recurring', at: iso(start), unit: 'week', interval: 1, timeZone: now.timeZoneId, until: until?.toString() ?? null }];
  });
}

function parseReminderList(text: string, now: Temporal.ZonedDateTime, draft: Draft) {
  const clauses = text.split(/\s*[,;]\s*|\s+y\s+(?:tambi[eé]n\s+)?(?=(?:al vencer|la v[ií]spera|el d[ií]a anterior|a las?|cada|todos?|d[ií]a por medio|avisame|(?:\d+|[\p{L}]+)\s+(?:minutos?|horas?|d[ií]as?)\s+antes)\b)/iu);
  for (const clause of clauses.filter(Boolean)) {
    const parsedWeek = weekdayReminders(clause, now);
    const single = parsedWeek ? undefined : readReminder(clause, now);
    const schedules = parsedWeek ?? (single ? [single] : []);
    if (!schedules.length) draft.warnings.push('Revisá el aviso «' + clause + '».');
    for (const schedule of schedules) {
      if (!draft.reminders.some((item) => JSON.stringify(item) === JSON.stringify(schedule))) draft.reminders.push(schedule);
    }
  }
}

export function interpretTask(
  transcript: string, projects: Pick<Project, 'id' | 'name'>[], now: Date, timeZone: string,
): Draft {
  const current = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timeZone);
  const draft: Draft = { title: '', reminders: [], warnings: [] };
  let text = withoutIntroduction(transcript.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/u, ''));
  const namedTitle = text.match(/(?:^|[.,;:]\s*|\s+(?:con|de|el)\s+)(?:t[ií]tulo|titulado|llamado)\s*(?::\s*|\s+)(.+?)(?=$|[.,;](?:\s|$)|\s+(?:y\s+|con\s+)?(?:descripci[oó]n|prioridad|recordatorios?|avisos?|av[ií]same|proyecto)\b|\s+para\s+(?:el\s+|hoy\b|mañana\b))/iu);
  if (namedTitle) text = text.replace(namedTitle[0], ' ');
  const description = text.match(/(?:^|[\s,;])(?:(?:y|con)\s+)?(?:la\s+)?descripci[oó]n\s*(?::\s*|\s+)(.+?)(?=$|[;,]\s*(?:con\s+)?(?:para\s+|prioridad\b|proyecto\b|recordatorios?\b|avisos?\b|av[ií]same\b|vence\b)|\s+con\s+(?:prioridad|recordatorios?|avisos?)\b)/iu);
  if (description) {
    draft.description = description[1].trim().replace(/^["“«]+|["”»]+$/gu, '');
    text = text.replace(description[0], ' ');
  }

  const project = text.match(/(?:\b(?:para\s+(?:el\s+)?|del\s+|en\s+(?:el\s+)?)proyecto|(?:^|[,;]\s*)proyecto)\s+(.+?)(?=\s*[,;]|$|\s+(?:con\s+)?(?:prioridad|avisos?|recordatorios?|av[ií]same|recordame)\b|\s+para\s+(?:el\s+|mañana\b|hoy\b)|\s+(?:vence|vencimiento)\b)/iu);
  if (project) {
    const requested = project[1].trim().replace(/^["“«]+|["”»]+$/gu, '');
    const matches = projects.filter((candidate) => fold(candidate.name.trim()) === fold(requested));
    if (matches.length === 1) draft.projectId = matches[0].id;
    else draft.warnings.push('Elegí el proyecto «' + requested + '».');
    text = text.replace(project[0], ' ');
  }

  const priority = text.match(/\b(?:con\s+)?(?:prioridad\s+(?:muy\s+)?(alta|urgente|media|normal|baja)|(es urgente))\b/iu);
  if (priority) {
    const value = fold(priority[1] ?? 'urgente');
    draft.priority = value === 'alta' || value === 'urgente' ? 'high' : value === 'baja' ? 'low' : 'normal';
    text = text.replace(priority[0], ' ');
  }

  text = text.trim().replace(/[\s,;.!?]+$/u, '');
  const reminder = text.match(/(?:\s|[,;])((?:con\s+)?(?:recordatorios?|avisos?|av[ií]same|recordame|recu[eé]rdame)\s+.+|(?:todos los (?:d[ií]as|meses)|todas las semanas|de lunes a viernes|d[ií]a por medio|diariamente|semanalmente|mensualmente)\b.*|cada\s+(?:(?:\d+|[\p{L}]+)\s+)?(?:d[ií]as?|semanas?|mes(?:es)?)\b.*)$/iu);
  if (reminder) {
    const clause = reminder[1].trim();
    parseReminderList(clause, current, draft);
    text = text.slice(0, reminder.index).trim().replace(/[\s,;.!?]+$/u, '');
  }

  const leadingDate = text.match(/^para\s+(.+?)\s*[:,.]\s+(.+)$/iu);
  if (leadingDate) {
    const due = readDateTime(leadingDate[1], current, 23, 59);
    if (due) { draft.dueAt = iso(due); text = leadingDate[2]; }
  }

  const dates = [...text.matchAll(/\b(?:para|vence(?:\s+el)?|vencimiento(?:\s+el)?)\s+/giu)];
  for (const match of dates.reverse()) {
    const candidate = text.slice(match.index + match[0].length);
    const due = readDateTime(candidate, current, 23, 59);
    if (!due) continue;
    draft.dueAt = iso(due);
    text = text.slice(0, match.index);
    break;
  }

  if (!draft.dueAt) {
    const trailing = text.match(/(?:^|\s)((?:pasado\s+mañana|mañana|hoy|el\s+(?:(?:pr[oó]ximo|siguiente)\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))(?:\s+a\s+las?\s+.+)?)$/iu);
    const due = trailing && readDateTime(trailing[1], current, 23, 59);
    if (due) { draft.dueAt = iso(due); text = text.slice(0, trailing.index); }
  }

  if (!draft.dueAt && draft.reminders.some((item) => item.kind === 'relative')) {
    draft.warnings.push('Agregá un vencimiento para programar avisos relativos.');
    draft.reminders = draft.reminders.filter((item) => item.kind !== 'relative');
  }

  const title = (namedTitle?.[1] ?? text).replace(/^[\s,;:"“«]+|[\s,;:.!?"”»]+$/gu, '');
  draft.title = title ? title[0].toLocaleUpperCase('es-AR') + title.slice(1) : '';
  return draft;
}
