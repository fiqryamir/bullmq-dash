---
'@bullmq-dash/api': patch
'@bullmq-dash/express': patch
'@bullmq-dash/fastify': patch
'@bullmq-dash/nestjs': patch
'@bullmq-dash/standalone': patch
'@bullmq-dash/ui': patch
---

Raise the Node floor to `>=22.12.0` across the suite - the docs site's
toolchain (Astro 6 / Starlight 0.40) brings in `@astrojs/prism@4`, which
requires Node 22.12+, and the repo's `engine-strict` setting makes that a
hard install requirement. No package code changes.
