'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previous;
    };
  }, []);

  return <dialog ref={dialog} className="panel-dialog" aria-labelledby={labelId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="panel-inner">
      <header className="panel-heading">
        <h2 id={labelId}>{title}</h2>
        <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={20} /></button>
      </header>
      {children}
    </div>
  </dialog>;
}

