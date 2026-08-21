import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://fiqryamir.github.io',
  base: '/bullmq-dash/',
  integrations: [
    starlight({
      title: 'bullmq-dash',
      description:
        'A modern, open-source BullMQ dashboard - embeddable in Node apps, runnable standalone.',
      logo: {
        src: './src/assets/logo.svg',
        alt: 'bullmq-dash',
      },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/fiqryamir/bullmq-dash' }],
      editLink: {
        disabled: true,
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        { label: 'Overview', link: '/' },
        {
          label: 'Guides',
          items: [
            { label: 'Quick start', link: '/guides/quick-start' },
            { label: 'Standalone', link: '/guides/standalone' },
            { label: 'Express', link: '/guides/express' },
            { label: 'Fastify', link: '/guides/fastify' },
            { label: 'NestJS', link: '/guides/nestjs' },
            { label: 'Migrating from bull-board', link: '/guides/migration' },
          ],
        },
        {
          label: 'Features',
          items: [
            { label: 'Job detail', link: '/guides/job-detail' },
            { label: 'Job search', link: '/guides/search' },
            { label: 'Flow view', link: '/guides/flow' },
            { label: 'Historical metrics', link: '/guides/metrics' },
          ],
        },
        {
          label: 'Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
});
