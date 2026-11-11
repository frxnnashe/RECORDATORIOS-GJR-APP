'use client';

import {
  Bell, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, Circle, Clock3, Columns3,
  Folder, Inbox, LayoutGrid, List, LogOut, Menu, Mic, Pencil, Plus, Search, Settings, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/client-api';
import { authClient } from '@/lib/auth-client';
import { isOverdue, statuses, statusLabels, type Project, type Status, type Task, type Workspace, type WorkspaceAction } from '@/lib/model';
import { Brand } from './brand';
import { TaskCard } from './task-card';
import { TaskEditor } from './task-editor';
import { ProjectEditor } from './project-editor';
import { SettingsPanel } from './settings-panel';

type View = 'board' | 'today' | 'inbox' | `project:${string}`;
type Editor =
  | { kind: 'task'; task?: Task; status: Status; dictation?: boolean }
  | { kind: 'project'; project?: Project }
  | { kind: 'settings' };

type Change = { task?: Task; project?: Project; deleted?: string };

const nav = [
  { id: 'today', text: 'Hoy', icon: CalendarDays },
  { id: 'board', text: 'Tablero', icon: LayoutGrid },
  { id: 'inbox', text: 'Bandeja de entrada', icon: Inbox },
] as const;

const dateHeader = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

function taskOrder(a: Task, b: Task) {
  return (a.dueAt ?? '\uffff').localeCompare(b.dueAt ?? '\uffff') || b.createdAt.localeCompare(a.createdAt);
}

function matches(query: string, task: Task, project?: Project) {
  const words = [task.title, task.description, project?.name, ...task.tags].join(' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return query.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/\s+/).every((word) => words.includes(word));
}

export function Dashboard({ initial, user, publicKey, initialTaskId, initialToday }: {
  initial: Workspace; user: { name: string; email: string }; publicKey: string;
  initialTaskId?: string; initialToday: boolean;
}) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>(initialToday ? 'today' : 'board');
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(() => {
    const task = initial.tasks.find((item) => item.id === initialTaskId);
    return task ? { kind: 'task', task, status: task.status } : null;
  });
  const [notice, setNotice] = useState(initialTaskId && !initial.tasks.some((item) => item.id === initialTaskId)
    ? 'Esa tarea ya no está disponible.' : '');
  const [error, setError] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Status | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const requestVersion = useRef(0);
  const closeMenuButton = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const workspace = await api<Workspace>('/api/workspace');
    if (version === requestVersion.current) setData(workspace);
  }, []);

  useEffect(() => {
    const updateTime = () => setNow(new Date());
    const frame = requestAnimationFrame(updateTime);
    const timer = window.setInterval(updateTime, 30_000);
    const updateWorkspace = () => {
      if (document.visibilityState === 'visible') {
        updateTime();
        void refresh().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', updateWorkspace);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', updateWorkspace);
    };
  }, [refresh]);

  useEffect(() => {
    if (!menuOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => closeMenuButton.current?.focus());
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', escape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', escape);
      opener?.focus();
    };
  }, [menuOpen]);

  async function save(action: WorkspaceAction) {
    setError('');
    try {
      const result = await api<Change>('/api/workspace', 'POST', action);
      requestVersion.current++;
      setData((previous) => {
        const { task, project, deleted } = result;
        const tasks = task ? [task, ...previous.tasks.filter((item) => item.id !== task.id)]
          : deleted ? previous.tasks.filter((item) => item.id !== deleted) : previous.tasks;
        const projects = project ? previous.projects.some((item) => item.id === project.id)
          ? previous.projects.map((item) => item.id === project.id ? project : item)
          : [...previous.projects, project] : previous.projects;
        return { tasks, projects };
      });
      if (result.deleted) setNotice('Tarea eliminada.');
      else if (action.type !== 'task.move') setNotice(result.task ? 'Tarea guardada.' : 'Proyecto guardado.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) location.reload();
      if (error instanceof ApiError && error.status === 409) {
        await refresh().catch(() => {});
        setEditor(null);
        setError(errorMessage(error));
      }
      throw error;
    }
  }

  async function move(task: Task, status: Status) {
    if (task.status === status || moving) return;
    setMoving(task.id);
    setNotice('');
    try {
      await save({ type: 'task.move', id: task.id, revision: task.revision, status });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setMoving(null);
    }
  }

  async function signOut() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) {
          await api('/api/push', 'POST', { type: 'disable', endpoint: subscription.endpoint });
          await subscription.unsubscribe().catch(() => {});
        }
      }
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      location.assign(location.origin + '/');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) location.reload();
      else setError('No pudimos cerrar la sesión. Probá de nuevo.');
    }
  }

  function navigate(next: View) {
    setView(next);
    setQuery('');
    setPriority(false);
    setMenuOpen(false);
  }

  function closeEditor() {
    setEditor(null);
    if (new URL(location.href).searchParams.has('task')) history.replaceState(null, '', '/');
  }

  const todayEnd = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : null;
  const soonEnd = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8) : null;
  const selectedProject = view.startsWith('project:') ? data.projects.find((item) => item.id === view.slice(8)) : undefined;
  const title = selectedProject?.name ?? ({ board: 'Tablero', today: 'Hoy', inbox: 'Bandeja de entrada' }[view as 'board' | 'today' | 'inbox'] ?? 'Tablero');
  const projectMap = new Map(data.projects.map((item) => [item.id, item]));
  const scoped = data.tasks.filter((task) => selectedProject ? task.projectId === selectedProject.id : view === 'inbox' ? !task.projectId : true);
  const filtered = scoped.filter((task) => (!priority || task.priority === 'high')
    && matches(query.trim(), task, task.projectId ? projectMap.get(task.projectId) : undefined)).sort(taskOrder);
  const overdue = now ? scoped.filter((task) => isOverdue(task, now)).length : 0;
  const inboxCount = data.tasks.filter((task) => !task.projectId && task.status !== 'done').length;
  const useBoard = view !== 'today' && layout === 'board';

  function renderTask(task: Task, list = false) {
    return <TaskCard key={task.id} task={task} now={now} busy={moving === task.id} list={list}
      project={task.projectId ? projectMap.get(task.projectId) : undefined}
      onOpen={() => setEditor({ kind: 'task', task, status: task.status })}
      onMove={(status) => void move(task, status)} onDrag={setDragging} />;
  }

  const agenda = todayEnd && soonEnd && now ? [
    { name: 'Vencidas', icon: CalendarClock, tasks: filtered.filter((task) => isOverdue(task, now)) },
    { name: 'Vencen hoy', icon: CalendarDays, tasks: filtered.filter((task) =>
      task.status !== 'done' && task.dueAt && new Date(task.dueAt) >= now && new Date(task.dueAt) < todayEnd) },
    { name: 'Próximos 7 días', icon: Clock3, tasks: filtered.filter((task) =>
      task.status !== 'done' && task.dueAt && new Date(task.dueAt) >= todayEnd && new Date(task.dueAt) < soonEnd) },
  ] : [];

  return <div className="workspace">
    {menuOpen && <button className="nav-scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <aside className={'sidebar' + (menuOpen ? ' sidebar-open' : '')}
      role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen || undefined} aria-label={menuOpen ? 'Menú principal' : undefined}>
      <div className="sidebar-brand"><Brand /><button className="icon-button close-nav" ref={closeMenuButton} onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button></div>
      <nav className="side-nav" aria-label="Espacio de trabajo">
        {nav.map(({ id, text, icon: Icon }) => <button key={id} className="nav-item" aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>
          <Icon size={17} /> <span>{text}</span> {id === 'inbox' && inboxCount > 0 && <small>{inboxCount}</small>}
        </button>)}
      </nav>
      <div className="side-projects">
        <div className="side-label"><h2>Proyectos</h2><button className="icon-button" onClick={() => { setMenuOpen(false); setEditor({ kind: 'project' }); }} aria-label="Nuevo proyecto"><Plus size={17} /></button></div>
        {data.projects.map((project) => <button className="nav-item project-nav" aria-current={view === 'project:' + project.id ? 'page' : undefined}
          key={project.id} onClick={() => navigate(`project:${project.id}`)} data-color={project.color}>
          <span className="project-dot" /><span>{project.name}</span>
        </button>)}
        {data.projects.length === 0 && <button className="nav-item new-project-nav" onClick={() => { setMenuOpen(false); setEditor({ kind: 'project' }); }}><Folder size={16} /><span>Crear proyecto</span></button>}
      </div>
      <div className="side-bottom">
        <button className="nav-item" onClick={() => { setMenuOpen(false); setEditor({ kind: 'settings' }); }}><Settings size={17} /><span>Configuración</span></button>
        <div className="profile">
          <span className="avatar">{user.name.trim().slice(0, 2).toUpperCase() || 'GJ'}</span>
          <span className="profile-copy"><b>{user.name}</b><small>{user.email}</small></span>
          <button className="icon-button" aria-label="Cerrar sesión" onClick={() => void signOut()}><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
    <div className="main-area" inert={menuOpen}>
      <header className="top-bar">
        <button className="icon-button menu-toggle" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={21} /></button>
        <div className="breadcrumb"><span>Mi espacio</span><ChevronRight size={14} /><strong>{title}</strong></div>
        <div className="top-actions">
          <span className="top-date">{now ? dateHeader.format(now) : ''}</span>
          <button className="icon-button top-bell" aria-label="Configurar notificaciones" onClick={() => setEditor({ kind: 'settings' })}><Bell size={19} /></button>
        </div>
      </header>
      <main className="workspace-content">
        <header className="workspace-heading">
          <div>
            <div className="workspace-title">
              {selectedProject && <span className="project-dot" data-color={selectedProject.color} />}
              <h1>{title}</h1>
              {selectedProject && <button className="icon-button" aria-label="Editar proyecto" onClick={() => setEditor({ kind: 'project', project: selectedProject })}><Pencil size={17} /></button>}
            </div>
            <p>{view === 'today' ? 'Vencimientos y próximos plazos.' : view === 'inbox'
              ? 'Tareas que todavía no tienen proyecto.' : selectedProject ? 'Tareas de este proyecto.' : 'Organizá las tareas de todos tus proyectos.'}</p>
          </div>
          <div className="create-actions">
            <button className="button secondary create-task" onClick={() => {
              setNotice('');
              setEditor({ kind: 'task', status: 'pending', dictation: true });
            }}><Mic size={18} /> Cargar por voz</button>
            <button className="button primary create-task" onClick={() => {
              setNotice('');
              setEditor({ kind: 'task', status: 'pending' });
            }}><Plus size={20} /> Nueva tarea</button>
          </div>
        </header>

        <div className="workspace-stats" aria-label="Resumen de tareas">
          <span><Circle size={15} /> <b>{scoped.length}</b> tareas</span>
          <span><Clock3 size={16} /> <b>{scoped.filter((item) => item.status === 'progress').length}</b> en curso</span>
          <span><CalendarClock size={16} /> <b>{overdue}</b> vencidas</span>
          <span><CheckCircle2 size={16} /> <b>{scoped.filter((item) => item.status === 'done').length}</b> hechas</span>
        </div>

        <div className="toolbar">
          {view !== 'today' && <div className="view-tabs" role="group" aria-label="Presentación de tareas">
            <button aria-pressed={layout === 'board'} onClick={() => setLayout('board')}><Columns3 size={17} /> Tablero</button>
            <button aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={17} /> Lista</button>
          </div>}
          <div className="toolbar-filters">
            <button className="button filter" aria-pressed={priority} onClick={() => setPriority(!priority)}>Prioridad alta</button>
            <label className="search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tareas" aria-label="Buscar tareas" /></label>
          </div>
        </div>

        {error && <p className="form-error workspace-notice" role="alert">{error}<button className="icon-button" aria-label="Cerrar mensaje" onClick={() => setError('')}><X size={16} /></button></p>}
        {notice && <p className="callout workspace-notice" role="status">{notice}<button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={16} /></button></p>}

        {useBoard && <div className="board">
          {statuses.map((status) => {
            const cards = filtered.filter((task) => task.status === status);
            return <section key={status} className={'board-column' + (dropTarget === status ? ' drop-target' : '')} data-status={status}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(status);
              }}
              onDragLeave={(event) => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const task = data.tasks.find((item) => item.id === dragging && item.id === event.dataTransfer.getData('text/plain'));
                setDropTarget(null);
                setDragging(null);
                if (task) void move(task, status);
              }}>
              <header className="column-header"><span className="status-dot" /><h2>{statusLabels[status]}</h2><span className="column-count">{cards.length}</span>
                <button className="icon-button" aria-label={'Nueva tarea en ' + statusLabels[status]} onClick={() => setEditor({ kind: 'task', status })}><Plus size={18} /></button>
              </header>
              <div className="column-tasks">
                {cards.map((task) => renderTask(task))}
                {!cards.length && <div className="column-empty">{query || priority ? 'Sin coincidencias' : 'Sin tareas'}</div>}
              </div>
            </section>;
          })}
        </div>}

        {!useBoard && view !== 'today' && <div className="agenda">
          {filtered.map((task) => renderTask(task, true))}
          {!filtered.length && <p className="empty-list">{query || priority ? 'No hay tareas que coincidan con los filtros.' : 'Todavía no hay tareas en esta vista.'}</p>}
        </div>}

        {view === 'today' && <div className="agenda">
          {agenda.map(({ name, icon: Icon, tasks }) => <section key={name} className="agenda-group">
            <h2><Icon size={18} /> {name} <span>{tasks.length}</span></h2>
            {tasks.map((task) => renderTask(task, true))}
            {!tasks.length && <p className="empty-list">No hay tareas en este período.</p>}
          </section>)}
        </div>}
      </main>
      <nav className="mobile-nav" aria-label="Navegación principal">
        {nav.map(({ id, text, icon: Icon }) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>
          <Icon size={20} /> {id === 'inbox' ? 'Bandeja' : text}
        </button>)}
        <button aria-current={view.startsWith('project:') ? 'page' : undefined} onClick={() => setMenuOpen(true)}><Folder size={20} /> Proyectos</button>
      </nav>
    </div>

    {editor?.kind === 'task' && <TaskEditor task={editor.task} projects={data.projects} defaultProject={selectedProject?.id ?? null}
      defaultStatus={editor.status} startWithDictation={editor.dictation} onClose={closeEditor} onSave={save} />}
    {editor?.kind === 'project' && <ProjectEditor project={editor.project} onClose={closeEditor} onSave={save} />}
    {editor?.kind === 'settings' && <SettingsPanel publicKey={publicKey} onClose={closeEditor} />}
  </div>;
}

