import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { interpretTask } from '../src/lib/dictation';

const timeZone = 'America/Argentina/Buenos_Aires';
const now = new Date('2026-11-11T11:00:00.000Z');
const projects = [{ id: 'web', name: 'Sitio Público' }, { id: 'interno', name: 'Sitio' }];

test('extrae fecha, prioridad, proyecto y un aviso diario de una frase dictada', () => {
  const draft = interpretTask(
    'Necesito revisar el formulario para mañana con recordatorios todos los días a las nueve y media, con prioridad alta, para el proyecto sitio público.',
    projects, now, timeZone,
  );
  assert.equal(draft.title, 'Revisar el formulario');
  assert.equal(draft.projectId, 'web');
  assert.equal(draft.priority, 'high');
  assert.equal(draft.dueAt, '2026-11-13T02:59:00.000Z');
  assert.deepEqual(draft.reminders[0], {
    kind: 'recurring', interval: 1, unit: 'day', timeZone, until: null, at: '2026-11-11T12:30:00.000Z',
  });
  assert.deepEqual(draft.warnings, []);
});

test('reconoce intervalos hablados y pide elegir un proyecto desconocido', () => {
  const draft = interpretTask('Verificar accesibilidad, cada tres días, para el proyecto Clientes.', projects, now, timeZone);
  assert.equal(draft.title, 'Verificar accesibilidad');
  assert.equal(draft.projectId, undefined);
  assert.equal(draft.reminders[0]?.kind === 'recurring' && draft.reminders[0].interval, 3);
  assert.ok(draft.warnings.some((warning) => warning.includes('Clientes')));
});

test('conserva un título libre y separa un aviso relativo explícito del vencimiento', () => {
  assert.equal(interpretTask('Preparar material para el equipo', projects, now, timeZone).title, 'Preparar material para el equipo');
  const draft = interpretTask('Revisar backups para el viernes a las 18, avisame 2 horas antes.', projects, now, timeZone);
  assert.equal(draft.title, 'Revisar backups');
  assert.equal(draft.dueAt, '2026-11-13T21:00:00.000Z');
  assert.deepEqual(draft.reminders[0], { kind: 'relative', minutes: 120 });
});

test('detecta un aviso puntual sin confundirlo con el vencimiento de la tarea', () => {
  const draft = interpretTask('Enviar informe, avisame mañana a las 8.', projects, now, timeZone);
  assert.equal(draft.title, 'Enviar informe');
  assert.equal(draft.dueAt, undefined);
  assert.deepEqual(draft.reminders[0], { kind: 'fixed', at: '2026-11-12T11:00:00.000Z' });
});

test('acepta saludo y pedido coloquial, título y descripción dictados', () => {
  const draft = interpretTask('Hola, necesito que me cargues un recordatorio con título Enviar propuesta y descripción Incluir precios, fechas y condiciones, para hoy con prioridad alta.', projects, now, timeZone);
  assert.equal(draft.title, 'Enviar propuesta');
  assert.equal(draft.description, 'Incluir precios, fechas y condiciones');
  assert.equal(draft.dueAt, '2026-11-12T02:59:00.000Z');
  assert.equal(draft.priority, 'high');
});

test('acepta un recordatorio día por medio y varios avisos en la misma frase', () => {
  const draft = interpretTask('Pon un recordatorio llamado Enviar presupuesto para el 20, avisame día por medio a las ocho, la víspera y al vencer.', projects, now, timeZone);
  assert.equal(draft.title, 'Enviar presupuesto');
  assert.equal(draft.dueAt, '2026-11-21T02:59:00.000Z');
  assert.equal(draft.reminders[0].kind === 'recurring' && draft.reminders[0].interval, 2);
  assert.deepEqual(draft.reminders.slice(1), [{ kind: 'relative', minutes: 1440 }, { kind: 'relative', minutes: 0 }]);
});

test('pide un título cuando se dicta solo la fecha', () => {
  const draft = interpretTask('Cargá un recordatorio para hoy.', projects, now, timeZone);
  assert.equal(draft.title, '');
  assert.equal(draft.dueAt, '2026-11-12T02:59:00.000Z');
});

test('admite que el vencimiento vaya primero y el título después', () => {
  const draft = interpretTask('Hola, cargá un recordatorio para mañana. Título: Revisar el formulario. Avisame cada dos días a las nueve.', projects, now, timeZone);
  assert.equal(draft.title, 'Revisar el formulario');
  assert.equal(draft.dueAt, '2026-11-13T02:59:00.000Z');
  assert.equal(draft.reminders[0].kind === 'recurring' && draft.reminders[0].interval, 2);
});

test('convierte los lunes y miércoles en dos series semanales', () => {
  const draft = interpretTask('Anotá revisar métricas, avisame los lunes y miércoles a las 10.', projects, now, timeZone);
  assert.equal(draft.reminders.length, 2);
  assert.deepEqual(draft.reminders.map((item) => item.kind === 'recurring' && [item.unit, item.at]), [
    ['week', '2026-11-16T13:00:00.000Z'], ['week', '2026-11-11T13:00:00.000Z'],
  ]);
});
