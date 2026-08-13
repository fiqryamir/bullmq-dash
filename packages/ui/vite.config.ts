import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { THEME_STORAGE_KEY } from './src/theme/constants';

const BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){}`;

function entryTemplatePlugin(): Plugin {
  return {
    name: 'bullmq-dash-entry-template',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const html = readFileSync(join(dist, 'index.html'), 'utf8');
      const template = html.replace(
        '<head>',
        `<head>
    <base href="<%= basePath %>">
    <script>${BOOT_SCRIPT}</script>
    <script id="__UI_CONFIG__" type="application/json"><%- uiConfig %></script>`
      );
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, 'index.ejs'), template);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), entryTemplatePlugin()],
  build: {
    outDir: 'dist',
  },
});
