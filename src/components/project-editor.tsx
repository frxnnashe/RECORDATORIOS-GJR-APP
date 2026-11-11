'use client';

import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { colorLabels, projectColors, type Project, type ProjectInput, type WorkspaceAction } from '@/lib/model';
import { errorMessage } from '@/lib/client-api';
import { Panel } from './panel';

export function ProjectEditor({ project, onClose, onSave }: {
  project?: Project; onClose: () => void; onSave: (action: WorkspaceAction) => Promise<void>;
}) {
  const [color, setColor] = useState<ProjectInput['color']>(project?.color ?? 'indigo');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) { setError('Escribí un nombre para el proyecto.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSave(project
        ? { type: 'project.update', id: project.id, revision: project.revision, project: { name, color } }
        : { type: 'project.create', project: { name, color } });
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <Panel title={project ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={submit} className="editor-form">
      <div className="panel-content">
        <label>Nombre<input name="name" required maxLength={64} defaultValue={project?.name} placeholder="Nombre del proyecto" /></label>
        <fieldset className="color-field">
          <legend>Color</legend>
          {projectColors.map((item) => <label className="color-option" key={item} data-color={item}>
            <input type="radio" name="color" value={item} checked={color === item} onChange={() => setColor(item)} />
            <span className="color-swatch" aria-label={colorLabels[item]}>{color === item && <Check size={18} />}</span>
            <span className="sr-only">{colorLabels[item]}</span>
          </label>)}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="panel-footer footer-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}><Check size={17} /> {busy ? 'Guardando…' : 'Guardar proyecto'}</button>
      </footer>
    </form>
  </Panel>;
}

