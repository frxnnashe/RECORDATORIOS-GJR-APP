'use client';

import { useEffect } from 'react';

export function PwaSetup() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
    }
  }, []);

  return null;
}

