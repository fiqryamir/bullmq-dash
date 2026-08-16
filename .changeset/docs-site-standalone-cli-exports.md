---
'@bullmq-dash/standalone': patch
---

The CLI's flag and environment-variable surface is now exported from
`config.ts` as `CLI_OPTIONS` and `CLI_ENV_VARS`, and the config resolver
reads env vars through that single mapping - so the `--help` text, the
docs site's standalone guide, and the implementation cannot drift. No
behavioral change.
