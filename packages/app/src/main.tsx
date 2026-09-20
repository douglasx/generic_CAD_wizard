import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri, type PlatformAdapter } from '@cadw/platform';
import { createWebPlatform } from '@cadw/platform/web';
import { App } from './App.tsx';
import './styles.css';

async function choosePlatform(): Promise<PlatformAdapter> {
  if (isTauri()) {
    const { createTauriPlatform } = await import('@cadw/platform/tauri');
    return createTauriPlatform();
  }
  // Automated browsers cannot drive native file pickers; use download/input fallbacks.
  return createWebPlatform({ useFilePickers: !navigator.webdriver });
}

const platform = await choosePlatform();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={platform} />
  </StrictMode>,
);
