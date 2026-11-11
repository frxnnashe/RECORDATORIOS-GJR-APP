const settingsKey = 'reminders-gjr-v1';
const cacheKey = 'reminders-gjr-widget-cache-v2';
const canonical = 'https://remindergjr.vercel.app';
const oldAlias = 'https://reminder-jgr.vercel.app';

function stored(key) {
  if (!Keychain.contains(key)) return null;
  try { return JSON.parse(Keychain.get(key)); } catch { return null; }
}

function normalizedBase(value) {
  const base = value.trim().replace(/\/+$/, '').toLowerCase();
  return base === oldAlias ? canonical : base;
}

async function configure(current) {
  const form = new Alert();
  form.title = 'Vincular Reminders GJR';
  form.message = 'Ingresá el dominio y la clave del widget que figura en Configuración.';
  form.addTextField(canonical, current?.base ?? canonical);
  form.addSecureTextField('Clave del widget');
  form.addAction('Vincular');
  form.addCancelAction('Cancelar');
  if (await form.presentAlert() < 0) return current;

  const base = normalizedBase(form.textFieldValue(0));
  const token = form.textFieldValue(1).trim();
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base) || !/^[\w-]{43}$/.test(token)) {
    const error = new Alert();
    error.title = 'Revisá el dominio y la clave';
    error.addAction('Entendido');
    await error.presentAlert();
    return current;
  }
  const settings = { base, token };
  Keychain.set(settingsKey, JSON.stringify(settings));
  if (Keychain.contains(cacheKey)) Keychain.remove(cacheKey);
  return settings;
}

async function loadTasks(settings) {
  const base = normalizedBase(settings.base);
  const request = new Request(base + '/api/widget/tasks');
  request.headers = { Authorization: 'Bearer ' + settings.token };
  request.timeoutInterval = 8;
  request.onRedirect = () => null;
  const data = await request.loadJSON();
  if ([401, 403].includes(request.response.statusCode)) {
    if (Keychain.contains(cacheKey)) Keychain.remove(cacheKey);
    return { message: 'Volvé a vincular el widget.', tasks: [] };
  }
  if (request.response.statusCode !== 200 || !Array.isArray(data.tasks)) throw new Error('Sin conexión');
  const view = {
    base,
    tasks: data.tasks.slice(0, 8),
    total: data.totalPending ?? data.tasks.length,
    generatedAt: data.generatedAt ?? new Date().toISOString(),
  };
  Keychain.set(cacheKey, JSON.stringify(view));
  return view;
}

function label(stack, text, size, weight, color) {
  const element = stack.addText(text);
  element.font = weight === 'strong' ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  element.textColor = new Color(color);
  element.lineLimit = 1;
  element.minimumScaleFactor = 0.85;
  return element;
}

function formatDate(value, format) {
  const formatter = new DateFormatter();
  formatter.locale = 'es_AR';
  formatter.dateFormat = format;
  return formatter.string(new Date(value));
}

function taskTime(task, now) {
  const reminder = task.nextReminderAt && new Date(task.nextReminderAt) > now ? task.nextReminderAt : null;
  const due = task.dueAt;
  if (reminder && (!due || new Date(due) <= now || reminder <= due)) {
    return { text: 'Aviso ' + formatDate(reminder, 'd MMM · HH:mm'), color: '#cfc5ff' };
  }
  if (due) return {
    text: (new Date(due) < now ? 'Venció ' : 'Vence ') + formatDate(due, 'd MMM · HH:mm'),
    color: new Date(due) < now ? '#ffb5ad' : '#b9d6f6',
  };
  return null;
}

function makeWidget(view, family) {
  const widget = new ListWidget();
  widget.setPadding(12, 13, 11, 13);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60_000);
  const gradient = new LinearGradient();
  gradient.colors = [new Color('#161c35'), new Color('#28244b')];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;

  const small = family === 'small';
  const limit = small ? 3 : family === 'large' || family === 'extraLarge' ? 6 : 3;
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named('bell.fill').image);
  icon.imageSize = new Size(12, 12);
  icon.tintColor = new Color('#b9a8ff');
  header.addSpacer(5);
  label(header, 'Reminders GJR', small ? 12 : 14, 'strong', '#ffffff');
  header.addSpacer();
  if (!small && view.tasks.length) label(header, String(view.total) + ' pendientes', 10, 'regular', '#b9b6d2');
  widget.addSpacer(small ? 7 : 9);

  if (!view.tasks.length) {
    const empty = label(widget, view.message || 'Sin tareas pendientes', 12, 'regular', '#d9d7e9');
    empty.lineLimit = 2;
  }

  const now = new Date();
  for (const task of view.tasks.slice(0, limit)) {
    const row = widget.addStack();
    row.centerAlignContent();
    const dot = row.addStack();
    dot.size = new Size(5, 5);
    dot.cornerRadius = 2.5;
    dot.backgroundColor = new Color(task.priority === 'high' ? '#ffb2a9' : '#aa9aff');
    row.addSpacer(6);
    const body = row.addStack();
    body.layoutVertically();
    label(body, task.title, small ? 11 : 13, 'strong', '#ffffff');
    const time = taskTime(task, now);
    const detail = small ? time?.text ?? task.project : [task.project, time?.text].filter(Boolean).join(' · ');
    if (detail) label(body, detail, small ? 8 : 10, 'regular', time?.color ?? '#c6c2df');
    widget.addSpacer(small ? 4 : 6);
  }

  widget.addSpacer();
  if (view.generatedAt) {
    const last = formatDate(view.generatedAt, 'd/M HH:mm');
    const more = Math.max(0, view.total - limit);
    const footer = small
      ? (view.stale ? 'Sin conexión · ' : '') + last + (more ? ' · +' + more : '')
      : (view.stale ? 'Últimos datos · ' : 'Actualizado · ') + last;
    label(widget, footer, small ? 8 : 10, 'regular', '#b9b6d2');
  }
  return widget;
}

async function main() {
  let settings = stored(settingsKey);
  if (!config.runsInWidget) {
    if (settings) {
      const menu = new Alert();
      menu.title = 'Reminders GJR';
      menu.addAction('Actualizar y ver');
      menu.addAction('Cambiar vinculación');
      menu.addCancelAction('Cerrar');
      const action = await menu.presentAlert();
      if (action < 0) return;
      if (action === 1) settings = await configure(settings);
    } else {
      settings = await configure(null);
    }
  }

  let view = { tasks: [], message: 'Abrí Scriptable para vincular la app.' };
  if (settings) {
    try {
      view = await loadTasks(settings);
    } catch {
      const cache = stored(cacheKey);
      view = cache?.base === normalizedBase(settings.base)
        ? { ...cache, stale: true }
        : { tasks: [], message: 'Sin conexión. Tocá para actualizar.' };
    }
  }

  const widget = makeWidget(view, config.widgetFamily ?? 'medium');
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
}

await main();
Script.complete();

