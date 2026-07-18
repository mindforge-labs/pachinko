'use client';

import { useEffect } from 'react';
import { createApp } from '../../src/app';

export default function PachinkoRuntime() {
  useEffect(() => {
    const app = createApp(document);
    return () => app.destroy();
  }, []);

  return null;
}
