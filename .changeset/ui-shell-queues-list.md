---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

New `@bullmq-dash/ui` package: the dashboard SPA shell (Base UI design system, dark mode by default with a light toggle, search-first command bar) rendering the queues list live from `GET /api/queues`. `createBullBoard` now resolves the UI package and drives the server adapter to serve the SPA's entry template and static assets; `options.uiBasePath` still overrides the bundle location.
