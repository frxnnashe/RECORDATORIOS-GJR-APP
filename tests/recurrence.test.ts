import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ReminderInput } from '../src/lib/model';
import { latestOccurrence, updateReminders } from '../src/lib/reminder-rules';

const everyTwo: ReminderInput = {
  kind: 'recurring', at: '2026-11-10T12:00:00.000Z', interval: 2, unit: 'day',
  timeZone: 'America/Argentina/Buenos_Aires', until: null,
};
const initial = new Date('2026-11-10T11:00:00.000Z');

test('cada dos días conserva la hora local y respeta el inicio de la serie', () => {
  const [reminder] = updateReminders([everyTwo], null, [], initial);
  assert.equal(latestOccurrence(reminder, new Date('2026-11-12T12:02:00Z')), '2026-11-12T12:00:00.000Z');
  assert.equal(latestOccurrence(reminder, new Date('2026-11-13T12:03:00Z')), null);
  assert.equal(latestOccurrence(reminder, new Date('2026-11-14T12:00:00Z')), '2026-11-14T12:00:00.000Z');
});

test('una serie mensual anclada el día 31 se ajusta en febrero y vuelve al 31 en marzo', () => {
  const [reminder] = updateReminders([{ ...everyTwo, at: '2027-01-31T12:00:00Z', interval: 1, unit: 'month' }], null, [], initial);
  assert.equal(latestOccurrence(reminder, new Date('2027-02-28T12:00:00Z')), '2027-02-28T12:00:00.000Z');
  assert.equal(latestOccurrence(reminder, new Date('2027-03-31T12:00:00Z')), '2027-03-31T12:00:00.000Z');
});

test('conserva la hora local cuando cambia el horario de verano', () => {
  const [reminder] = updateReminders([{
    ...everyTwo, at: '2027-03-13T14:00:00Z', timeZone: 'America/New_York', interval: 1,
  }], null, [], initial);
  assert.equal(latestOccurrence(reminder, new Date('2027-03-14T13:00:00Z')), '2027-03-14T13:00:00.000Z');
});

test('el último día local se incluye y los días posteriores no se programan', () => {
  const [reminder] = updateReminders([{ ...everyTwo, interval: 1, until: '2026-11-12' }], null, [], initial);
  assert.equal(latestOccurrence(reminder, new Date('2026-11-12T12:02:00Z')), '2026-11-12T12:00:00.000Z');
  assert.equal(latestOccurrence(reminder, new Date('2026-11-13T12:02:00Z')), null);
  assert.throws(() => updateReminders([{ ...everyTwo, until: '2026-11-09' }], null, [], initial), /fin/i);
});

test('editar otra propiedad no cambia la identidad ni la activación del aviso recurrente', () => {
  const first = updateReminders([everyTwo], null, [], initial);
  const editedAt = new Date('2026-11-14T11:00:00Z');
  assert.deepEqual(updateReminders([everyTwo], null, first, editedAt), first);
  const [changed] = updateReminders([{ ...everyTwo, interval: 3 }], null, first, editedAt);
  assert.notEqual(changed.id, first[0].id);
  assert.equal(latestOccurrence(changed, editedAt), null);
});
