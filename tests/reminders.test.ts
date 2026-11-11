import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { updateReminders } from '../src/lib/reminder-rules';

const dueAt = new Date('2026-11-12T13:00:00.000Z');
const previous = [
  { id: 'relative', kind: 'relative' as const, minutes: 60, fireAt: '2026-11-12T12:00:00.000Z' },
  { id: 'fixed', kind: 'fixed' as const, at: '2026-11-12T11:00:00.000Z', fireAt: '2026-11-12T11:00:00.000Z' },
];

test('mover el plazo reprograma el aviso relativo y conserva la fecha del personalizado', () => {
  const result = updateReminders(previous, new Date('2026-11-12T15:00:00.000Z'), previous);
  assert.equal(result[0].fireAt, '2026-11-12T14:00:00.000Z');
  assert.notEqual(result[0].id, 'relative');
  assert.deepEqual(result[1], previous[1]);
});

test('un recordatorio personalizado se puede guardar sin vencimiento', () => {
  const result = updateReminders([{ kind: 'fixed', at: '2026-11-12T11:00:00Z' }], null, []);
  assert.equal(result[0].fireAt, '2026-11-12T11:00:00.000Z');
});

test('un recordatorio relativo requiere un vencimiento', () => {
  assert.throws(() => updateReminders([{ kind: 'relative', minutes: 60 }], null, []), /vencimiento/);
});

test('guardar una tarea sin cambiar el horario conserva la identidad del aviso', () => {
  assert.deepEqual(updateReminders(previous, dueAt, previous), previous);
});

test('una tarea admite una sola notificación por horario', () => {
  assert.throws(
    () => updateReminders([...previous, { kind: 'fixed', at: '2026-11-12T12:00:00Z' }], dueAt, previous),
    /mismo horario/,
  );
});
