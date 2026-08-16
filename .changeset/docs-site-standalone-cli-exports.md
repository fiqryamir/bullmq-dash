---
'@bullmq-dash/standalone': patch
---

The CLI's flag and environment-variable surface is now exported from
`config.ts` (`CLI_OPTIONS`, `CLI_ENV_VARS`, `FLAGS_WITHOUT_ENV_VAR`) and
re-exported from the package entry, and the config resolver reads env vars
through that single mapping - so the `--help` text, the docs site's
standalone guide, and the implementation cannot drift. No behavioral
change.
