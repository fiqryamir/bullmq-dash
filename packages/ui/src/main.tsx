import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { readUiConfig } from './config';
import { i18n, loadLocale, resolveInitialLng } from './i18n';
import './design-system/tokens.css';

const container = document.getElementById('root');

/**
 * Boots the SPA after the initial locale is in place: the language choice is
 * resolved (stored choice, then the board config, then the browser) and the
 * locale's chunk is loaded before the first render so the dashboard never
 * flashes English.
 */
async function boot() {
  const initialLng = resolveInitialLng(readUiConfig().locale?.lng);
  if (initialLng !== i18n.language) {
    await loadLocale(initialLng);
    await i18n.changeLanguage(initialLng);
  }

  if (container) {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
}

void boot();
