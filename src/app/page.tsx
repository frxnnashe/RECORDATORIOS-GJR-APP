import { headers } from 'next/headers';
import { AuthScreen } from '@/components/auth-screen';
import { Dashboard } from '@/components/dashboard';
import { auth, googleEnabled, recoveryEnabled } from '@/lib/server/auth';
import { vapidPublicKey } from '@/lib/server/push';
import { getWorkspace } from '@/lib/server/workspace';
import { z } from 'zod';

async function loadDashboard() {
  try {
    const session = await auth().api.getSession({ headers: await headers() });
    if (!session) return { status: 'anonymous' as const };
    const initial = await getWorkspace(session.user.id);
    const user = { name: session.user.name, email: session.user.email };
    return { status: 'ready' as const, initial, user };
  } catch {
    return { status: 'unavailable' as const };
  }
}

export default async function Page({ searchParams }: {
  searchParams: Promise<{ task?: string; view?: string; token?: string; error?: string }>;
}) {
  const query = await searchParams;
  const task = z.uuid().safeParse(query.task);
  const target = task.success ? '/?task=' + task.data : query.view === 'today' ? '/?view=today' : '/';
  const configured = Boolean(process.env.MONGODB_URI && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL);
  const access = { google: googleEnabled(), recovery: recoveryEnabled(), target, configured };

  if (!configured || typeof query.token === 'string') {
    return <AuthScreen {...access} resetToken={query.token} />;
  }
  const dashboard = await loadDashboard();
  if (dashboard.status === 'unavailable') return <AuthScreen {...access} unavailable />;
  if (dashboard.status === 'anonymous') return <AuthScreen {...access} invalidLink={query.error === 'INVALID_TOKEN'} />;

  return <Dashboard initial={dashboard.initial} user={dashboard.user}
    publicKey={vapidPublicKey()} initialTaskId={task.data} initialToday={query.view === 'today'} />;
}

