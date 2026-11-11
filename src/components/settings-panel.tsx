'use client';

import { Bell, Copy, Download, ExternalLink, Smartphone, SquareStack } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/client-api';
import { Panel } from './panel';

type DeviceStatus = 'loading' | 'unavailable' | 'blocked' | 'off' | 'on';

function supportsPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function applicationKey(value: string) {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
}

export function SettingsPanel({ publicKey, onClose }: { publicKey: string; onClose: () => void }) {
  const [status, setStatus] = useState<DeviceStatus>('loading');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [showInstall, setShowInstall] = useState(false);
  const activeWorker = useRef<ServiceWorkerRegistration | null>(null);
  const savedSubscription = useRef<PushSubscription | null>(null);

  useEffect(() => {
    let disposed = false;
    async function check() {
      if (!supportsPush()) return 'unavailable';
      if (Notification.permission === 'denied') return 'blocked';
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      activeWorker.current = registration.active ? registration : await navigator.serviceWorker.ready;
      savedSubscription.current = await activeWorker.current.pushManager.getSubscription();
      if (!savedSubscription.current) return 'off';
      const result = await api<{ enabled: boolean }>('/api/push', 'POST', {
        type: 'status', endpoint: savedSubscription.current.endpoint,
      });
      return result.enabled ? 'on' : 'off';
    }
    void check().then((value) => { if (!disposed) setStatus(value); })
      .catch(() => { if (!disposed) setStatus('unavailable'); });
    return () => { disposed = true; };
  }, []);

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name);
    setNotice('');
    setError('');
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy('');
    }
  }

  function enable() {
    void run('enable', async () => {
      const active = activeWorker.current;
      if (!active) return;
      const previous = savedSubscription.current;
      let subscription: PushSubscription;
      try {
        subscription = previous ?? await active.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(publicKey),
        });
      } catch (error) {
        if (Notification.permission === 'denied') { setStatus('blocked'); return; }
        throw error;
      }
      try {
        await api('/api/push', 'POST', { type: 'enable', subscription: subscription.toJSON() });
      } catch (error) {
        if (!previous) await subscription.unsubscribe().catch(() => {});
        throw error;
      }
      savedSubscription.current = subscription;
      setStatus('on');
      setNotice('Notificaciones activadas en este dispositivo.');
    });
  }

  function handlePush(type: 'disable' | 'test') {
    void run(type, async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) { setStatus('off'); return; }
      try {
        await api('/api/push', 'POST', { type, endpoint: subscription.endpoint });
      } catch (error) {
        if (!(error instanceof ApiError) || ![404, 410].includes(error.status)) throw error;
        await subscription.unsubscribe();
        savedSubscription.current = null;
        setStatus('off');
        throw error;
      }
      if (type === 'disable') {
        await subscription.unsubscribe();
        savedSubscription.current = null;
        setStatus('off');
        setNotice('Notificaciones desactivadas.');
      } else {
        setNotice('Aviso de prueba enviado a este dispositivo.');
      }
    });
  }

  return <Panel title="Configuración" onClose={onClose}>
    <div className="panel-content settings-content">
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="callout" role="status">{notice}</p>}
      <section className="settings-group">
        <div className="settings-heading"><span><Bell size={19} /></span><h3>Notificaciones</h3></div>
        <p>Recibí avisos programados aunque la app esté cerrada.</p>
        {!publicKey && <p className="callout">El envío de avisos todavía no está configurado.</p>}
        {status === 'blocked' && <p className="callout">Habilitá los avisos para Reminders GJR en los ajustes del dispositivo.</p>}
        {status === 'unavailable' && <p className="callout">En iPhone, agregá la app a la pantalla de inicio y abrila desde su ícono.</p>}
        <div className="settings-actions">
          {publicKey && status === 'off' && <button className="button primary" onClick={enable} disabled={!!busy}>Activar notificaciones</button>}
          {status === 'on' && <>
            <button className="button primary" onClick={() => handlePush('test')} disabled={!!busy || !publicKey}>Enviar aviso de prueba</button>
            <button className="button secondary" onClick={() => handlePush('disable')} disabled={!!busy}>Desactivar</button>
          </>}
        </div>
      </section>
      <section className="settings-group">
        <div className="settings-heading"><span><Smartphone size={19} /></span><h3>Instalar en iPhone</h3></div>
        <button className="text-button" aria-expanded={showInstall} onClick={() => setShowInstall(!showInstall)}>
          {showInstall ? 'Ocultar instrucciones' : 'Ver instrucciones'}
        </button>
        {showInstall && <ol>
          <li>Abrí Reminders GJR en Safari y tocá Compartir.</li>
          <li>Elegí Añadir a pantalla de inicio. Activá Abrir como app web si aparece la opción.</li>
          <li>Abrí Reminders GJR desde el ícono y activá las notificaciones.</li>
        </ol>}
      </section>
      <section className="settings-group">
        <div className="settings-heading"><span><SquareStack size={19} /></span><h3>Widget de Scriptable</h3></div>
        <p>Mostrá tus últimas tareas pendientes en la pantalla de inicio.</p>
        <ol>
          <li>Instalá <a href="https://scriptable.app/" target="_blank" rel="noreferrer">Scriptable <ExternalLink size={12} /></a> en tu iPhone.</li>
          <li>Descargá el archivo, compartilo con Scriptable o pegá su contenido en un script nuevo.</li>
          <li>Ejecutá el script, ingresá la URL de Reminders GJR y la clave. Luego agregá un widget de Scriptable y elegí el script.</li>
        </ol>
        <div className="settings-actions">
          <a className="button secondary" href="/widget/reminders-gjr.js" download><Download size={16} /> Descargar script</a>
          <button className="button secondary" disabled={!!busy} onClick={() => void run('widget', async () => {
            const result = await api<{ token: string }>('/api/widget/token', 'POST');
            setToken(result.token);
            setNotice('Clave nueva creada. Reemplazá la anterior en Scriptable.');
          })}>Generar clave</button>
        </div>
        {token && <label className="widget-token">Clave del widget
          <span className="inline-field">
            <input value={token} readOnly onFocus={(event) => event.currentTarget.select()} />
            <button className="button secondary" aria-label="Copiar clave" onClick={() => void run('copy', async () => {
              await navigator.clipboard.writeText(token);
              setNotice('Clave copiada.');
            })}><Copy size={16} /></button>
          </span>
        </label>}
        <button className="text-button delete-button" disabled={!!busy} onClick={() => void run('revoke', async () => {
          await api('/api/widget/token', 'DELETE');
          setToken('');
          setNotice('La clave del widget fue revocada.');
        })}>Revocar clave</button>
      </section>
    </div>
  </Panel>;
}

