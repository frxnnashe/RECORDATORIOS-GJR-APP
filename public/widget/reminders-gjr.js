const key = 'reminders-gjr-v1';

async function configure() {
  const form = new Alert();
  form.title = 'Vincular Reminders GJR';
  form.message = 'Ingresá el dominio publicado y la clave generada en Configuración.';
  form.addTextField('https://tu-app.vercel.app');
  form.addSecureTextField('Clave del widget');
  form.addAction('Vincular');
  form.addCancelAction('Cancelar');
  if (await form.presentAlert() < 0) return false;

  const base = form.textFieldValue(0).trim().replace(/\/$/, '');
  const token = form.textFieldValue(1).trim();
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base) || !/^[\w-]{43}$/.test(token)) {
    const message = new Alert();
    message.title = 'Revisá el dominio y la clave';
    message.message = 'Ingresá la URL HTTPS de la app y una clave válida.';
    message.addAction('Entendido');
    await message.presentAlert();
    return false;
  }
  Keychain.set(key, JSON.stringify({ base, token }));
  return true;
}

async function loadTasks(settings) {
  const request = new Request(settings.base + '/api/widget/tasks');
  request.headers = { Authorization: 'Bearer ' + settings.token };
  request.timeoutInterval = 8;
  request.onRedirect = () => null;
  const data = await request.loadJSON();
  if (request.response.statusCode !== 200 || !Array.isArray(data.tasks)) throw new Error('Acceso inválido');
  return data.tasks;
}

function makeWidget(settings, tasks, message) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color('#18213a');
  widget.setPadding(13, 14, 13, 14);
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60000);
  if (settings) widget.url = settings.base + '/';

  const heading = widget.addText('Reminders GJR');
  heading.textColor = new Color('#ffffff');
  heading.font = Font.semiboldSystemFont(14);
  heading.lineLimit = 1;
  widget.addSpacer(9);

  if (message || !tasks.length) {
    const label = widget.addText(message || 'Sin tareas pendientes');
    label.textColor = new Color('#cbd5ed');
    label.font = Font.systemFont(12);
    widget.addSpacer();
    return widget;
  }

  const formatter = new DateFormatter();
  formatter.locale = 'es_AR';
  formatter.dateFormat = 'd MMM';
  const limit = config.widgetFamily === 'small' ? 2 : 3;
  for (const task of tasks.slice(0, limit)) {
    const row = widget.addStack();
    row.layoutVertically();
    row.url = settings.base + '/?task=' + encodeURIComponent(task.id);
    const title = row.addText(task.title);
    title.font = Font.semiboldSystemFont(12);
    title.textColor = new Color('#ffffff');
    title.lineLimit = 1;
    const detail = [task.project, task.dueAt && formatter.string(new Date(task.dueAt))].filter(Boolean).join(' · ');
    if (detail) {
      const subtitle = row.addText(detail);
      subtitle.textColor = new Color('#cbd5ed');
      subtitle.font = Font.systemFont(10);
      subtitle.lineLimit = 1;
    }
    widget.addSpacer(7);
  }
  widget.addSpacer();
  return widget;
}

if (!config.runsInWidget) {
  if (Keychain.contains(key)) {
    const options = new Alert();
    options.title = 'Reminders GJR';
    options.addAction('Ver widget');
    options.addAction('Cambiar vinculación');
    options.addCancelAction('Salir');
    const choice = await options.presentAlert();
    if (choice < 0) { Script.complete(); return; }
    if (choice === 1 && !await configure()) { Script.complete(); return; }
  } else if (!await configure()) {
    Script.complete();
    return;
  }
}

let settings;
let tasks = [];
let message = 'Abrí Scriptable para vincular la app.';
if (Keychain.contains(key)) {
  settings = JSON.parse(Keychain.get(key));
  try {
    tasks = await loadTasks(settings);
    message = '';
  } catch {
    message = 'No se pudo actualizar. Revisá la vinculación.';
  }
}
const widget = makeWidget(settings, tasks, message);
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();

