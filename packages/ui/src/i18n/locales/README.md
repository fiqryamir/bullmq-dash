# Locale files

`messages.json` per locale, one namespace (`messages`) with per-view groups —
the same layout bull-board ships. The locales listed below are the ones
bull-board ships (12 total), copied from the MIT-licensed
[`felixmosh/bull-board`](https://github.com/felixmosh/bull-board) repo at
v8.6.1 (`packages/ui/src/static/locales`, 2026-08):

- da-DK, de-DE, en-GB, en-US, es-ES, fr-FR, ja-JP, ko-KR, pt-BR, ru-RU, tr-TR, zh-CN

**en-US is the primary language** and the source of truth for the key set.
Keys bullmq-dash shares with bull-board keep bull-board's translations; the
dashboard-specific keys (APP, COMMON, NAV, QUEUE_JOBS, JOB_DETAIL, WORKERS,
FLOW, SEARCH groups and the METRICS/REDIS/SCHEDULERS additions) are translated
in every locale too.

To add or change copy:

1. Edit `en-US/messages.json`.
2. Run `pnpm --filter @bullmq-dash/ui sync:locales` to copy new keys into every
   locale (existing translations are preserved, plural keys are expanded per
   CLDR rules).
3. The `i18n.spec.ts` sync test fails until the files are in sync.

New keys are English in every locale until translated — add the translations
for the other locales in the same change, and keep every `{{placeholder}}`
token identical to en-US.

Plural keys use the i18next `_one` / `_other` suffix convention (the sync tool
expands them per language); `_one` means the singular rule, so write
`DAYS_one: "{{count}} day"` and `DAYS: "{{count}} days"`.
