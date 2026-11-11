import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Reminders GJR',
    short_name: 'Reminders GJR',
    description: 'Tareas, proyectos y recordatorios.',
    lang: 'es-AR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#f7f8fb',
    background_color: '#f7f8fb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

