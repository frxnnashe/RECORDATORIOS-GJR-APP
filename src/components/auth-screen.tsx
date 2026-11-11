'use client';

import { ArrowRight, Bell, CalendarDays, LayoutGrid } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { Brand } from './brand';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

const headings = {
  signin: ['Iniciá sesión', 'Ingresá para ver tus proyectos y tareas.'],
  signup: ['Creá tu cuenta', 'Empezá a organizar tus proyectos.'],
  forgot: ['Recuperá tu acceso', 'Te enviaremos un enlace para cambiar tu contraseña.'],
  reset: ['Elegí una contraseña', 'Usá al menos ocho caracteres.'],
};

const actions = {
  signin: 'Ingresar', signup: 'Crear cuenta', forgot: 'Enviar enlace', reset: 'Guardar contraseña',
};

export function AuthScreen({ google, recovery, target, resetToken, configured, unavailable, invalidLink }: {
  google: boolean; recovery: boolean; target: string; resetToken?: string;
  configured: boolean; unavailable?: boolean; invalidLink?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin');
  const [error, setError] = useState(invalidLink ? 'El enlace de recuperación no es válido o ya venció.' : '');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email') ?? '').trim();
    const password = String(fields.get('password') ?? '');
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({ email, redirectTo: location.origin + '/' });
        if (result.error) throw new Error('No pudimos enviar el enlace. Probá de nuevo.');
        setNotice('Si el correo está registrado, vas a recibir un enlace.');
      } else if (mode === 'reset') {
        const result = await authClient.resetPassword({ newPassword: password, token: resetToken });
        if (result.error) throw new Error('El enlace ya no es válido. Solicitá uno nuevo.');
        switchMode('signin');
        history.replaceState(null, '', '/');
        setNotice('Contraseña actualizada. Ya podés ingresar.');
      } else {
        const result = mode === 'signup'
          ? await authClient.signUp.email({ email, password, name: String(fields.get('name') ?? '').trim() })
          : await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(mode === 'signup'
          ? 'No pudimos crear la cuenta. Revisá el correo o probá iniciar sesión.'
          : 'No pudimos ingresar. Revisá tus datos e intentá otra vez.');
        location.assign(target);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'El servicio no está disponible.');
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: location.origin + target });
      if (result.error) throw new Error();
    } catch {
      setError('No pudimos iniciar sesión con Google. Probá de nuevo.');
      setBusy(false);
    }
  }

  return <main className="auth-layout">
    <aside className="auth-aside">
      <Brand />
      <div className="auth-visual">
        <div className="auth-orbit orbit-one" />
        <div className="auth-orbit orbit-two" />
        <div className="auth-graphic" aria-hidden="true">
          <span><LayoutGrid /></span><span><CalendarDays /></span><span><Bell /></span>
        </div>
        <h2>Organizá tus proyectos y plazos</h2>
        <p>Consultá lo que vence hoy y programá avisos para cada tarea.</p>
      </div>
    </aside>
    <section className="auth-main">
      <div className="auth-mobile-brand"><Brand /></div>
      <div className="auth-form-wrap">
        <h1>{headings[mode][0]}</h1>
        <p className="muted">{headings[mode][1]}</p>
        {!configured && <p className="callout" role="status">Falta configurar la conexión a MongoDB y el inicio de sesión.</p>}
        {unavailable && <p className="callout" role="status">El servicio no está disponible. Volvé a cargar la página.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="callout" role="status">{notice}</p>}
        <form className="auth-form" onSubmit={submit} key={mode}>
          {mode === 'signup' && <label>Nombre<input name="name" autoComplete="name" required maxLength={64} /></label>}
          {mode !== 'reset' && <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
          {mode !== 'forgot' && <label>Contraseña<input name="password" type="password" minLength={8} maxLength={128} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required /></label>}
          {mode === 'signin' && recovery && <button className="text-button forgot" type="button" onClick={() => switchMode('forgot')}>¿Olvidaste tu contraseña?</button>}
          <button className="button primary auth-submit" type="submit" disabled={busy || !configured || unavailable}>
            {busy ? 'Un momento…' : actions[mode]} <ArrowRight size={17} />
          </button>
        </form>
        {google && (mode === 'signin' || mode === 'signup') && <button className="button secondary google-button" onClick={signInWithGoogle} disabled={busy || !configured || unavailable}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.5H24v8.5h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.8-3.5 6-8.8 6-15.3Z"/>
            <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20 20 0 0 0 24 44Z"/>
            <path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7V15H5.7a20 20 0 0 0 0 18Z"/>
            <path fill="#EA4335" d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.7A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.7 15.2l6.9 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/>
          </svg> Continuar con Google
        </button>}
        <div className="auth-switch">
          {mode === 'signin' ? <>¿Primera vez? <button className="text-button" onClick={() => switchMode('signup')}>Creá una cuenta</button></>
            : <button className="text-button" onClick={() => switchMode('signin')}>Volver a iniciar sesión</button>}
        </div>
      </div>
    </section>
  </main>;
}

