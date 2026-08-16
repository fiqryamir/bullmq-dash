---
'@bullmq-dash/ui': minor
---

i18n: the dashboard speaks the 12 locales bull-board ships (en-US, en-GB,
da-DK, de-DE, es-ES, fr-FR, ja-JP, ko-KR, pt-BR, ru-RU, tr-TR, zh-CN) through
the same infrastructure bull-board uses — i18next with a `messages` namespace
grouped per view. Locale files are copied from the MIT-licensed bull-board
repo at v8.6.1 and kept in sync with en-US by an `i18next-locales-sync` script
(`pnpm --filter @bullmq-dash/ui sync:locales`) plus a spec that fails when the
files drift. Every existing view resolves its copy through the translation
layer: state names via bull-board's `QUEUE.STATUS` keys, shared actions via
`JOB.ACTIONS`/`QUEUE.ACTIONS`, and the dashboard-specific strings (APP,
COMMON, NAV, QUEUE_JOBS, JOB_DETAIL, WORKERS, FLOW, SEARCH groups and the
METRICS/REDIS/SCHEDULERS additions) are translated in all 12 locales too. A
language switcher sits in the header: the choice persists in localStorage,
honors `uiConfig.locale.lng` as the board-configured default, and falls back
to the browser language (region-less values like `de` match their shipped
locale) then en-US. en-US stays bundled; other locales load as ~7.5 kB
gzipped chunks on first use.
