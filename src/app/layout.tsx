import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/instrument-sans';
import './globals.css';
import { PwaSetup } from '@/components/pwa-setup';

export const metadata: Metadata = {
  title: 'Reminders GJR',
  description: 'Tareas, proyectos y recordatorios de Reminders GJR.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Reminders GJR', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#f7f8fb', viewportFit: 'cover' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body><PwaSetup />{children}</body></html>;
}

