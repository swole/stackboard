import type { StackableTree } from './types'

// Demo data used when the app runs outside an extension context (e.g. vite preview).
// Keeps the UI render-able for screenshots, marketing, local design iteration.
export const DEMO_TREE: StackableTree = {
  rootId: 'demo-root',
  spaces: [
    {
      id: 'sp-work',
      rawTitle: '⚡ Work',
      name: 'Work',
      emoji: '⚡',
      stacks: [
        {
          id: 'st-work-dailies',
          parentSpaceId: 'sp-work',
          title: 'Dailies',
          bookmarks: [
            { id: 'bm-1', parentStackId: 'st-work-dailies', title: 'Notion — Today', url: 'https://www.notion.so' },
            { id: 'bm-2', parentStackId: 'st-work-dailies', title: 'Linear — Inbox', url: 'https://linear.app' },
            { id: 'bm-3', parentStackId: 'st-work-dailies', title: 'Calendar', url: 'https://calendar.google.com' },
            { id: 'bm-4', parentStackId: 'st-work-dailies', title: 'Slack', url: 'https://slack.com' },
          ],
        },
        {
          id: 'st-work-docs',
          parentSpaceId: 'sp-work',
          title: 'Docs',
          bookmarks: [
            { id: 'bm-5', parentStackId: 'st-work-docs', title: 'Engineering wiki', url: 'https://github.com' },
            { id: 'bm-6', parentStackId: 'st-work-docs', title: 'Onboarding handbook', url: 'https://www.notion.so' },
            { id: 'bm-7', parentStackId: 'st-work-docs', title: 'API reference', url: 'https://developer.mozilla.org' },
            // Shows off the title handling: "– Figma" is dropped, the end stays visible.
            { id: 'bm-7b', parentStackId: 'st-work-docs', title: 'Rewards Experience Design Phase 2 – Figma', url: 'https://www.figma.com/design/demo/rewards', dateAdded: Date.now() - 60 * 60 * 1000 },
            { id: 'bm-7c', parentStackId: 'st-work-docs', title: '💎 Crown Jewel', url: 'https://example.com/crown-jewel' },
          ],
        },
        {
          id: 'st-work-dashboards',
          parentSpaceId: 'sp-work',
          title: 'Dashboards',
          bookmarks: [
            { id: 'bm-8', parentStackId: 'st-work-dashboards', title: 'Mixpanel', url: 'https://mixpanel.com' },
            { id: 'bm-9', parentStackId: 'st-work-dashboards', title: 'Grafana', url: 'https://grafana.com' },
            { id: 'bm-10', parentStackId: 'st-work-dashboards', title: 'Sentry', url: 'https://sentry.io' },
            { id: 'bm-11', parentStackId: 'st-work-dashboards', title: 'PagerDuty', url: 'https://www.pagerduty.com' },
          ],
        },
      ],
    },
    {
      id: 'sp-reading',
      rawTitle: '📚 Reading',
      name: 'Reading',
      emoji: '📚',
      stacks: [
        {
          id: 'st-reading-essays',
          parentSpaceId: 'sp-reading',
          title: 'Essays',
          bookmarks: [
            { id: 'bm-r1', parentStackId: 'st-reading-essays', title: 'Paul Graham — Essays', url: 'http://www.paulgraham.com/articles.html' },
            { id: 'bm-r2', parentStackId: 'st-reading-essays', title: 'Stratechery', url: 'https://stratechery.com' },
            { id: 'bm-r3', parentStackId: 'st-reading-essays', title: 'Marginal Revolution', url: 'https://marginalrevolution.com' },
          ],
        },
        {
          id: 'st-reading-papers',
          parentSpaceId: 'sp-reading',
          title: 'Papers',
          bookmarks: [
            { id: 'bm-r4', parentStackId: 'st-reading-papers', title: 'arXiv', url: 'https://arxiv.org' },
            { id: 'bm-r5', parentStackId: 'st-reading-papers', title: 'Papers With Code', url: 'https://paperswithcode.com' },
          ],
        },
      ],
    },
    {
      id: 'sp-side',
      rawTitle: '🛠️ Side projects',
      name: 'Side projects',
      emoji: '🛠️',
      stacks: [
        {
          id: 'st-side-repos',
          parentSpaceId: 'sp-side',
          title: 'Repos',
          bookmarks: [
            { id: 'bm-s1', parentStackId: 'st-side-repos', title: 'GitHub', url: 'https://github.com' },
            { id: 'bm-s2', parentStackId: 'st-side-repos', title: 'Vercel', url: 'https://vercel.com' },
            { id: 'bm-s3', parentStackId: 'st-side-repos', title: 'Supabase', url: 'https://supabase.com' },
          ],
        },
        {
          id: 'st-side-design',
          parentSpaceId: 'sp-side',
          title: 'Design',
          bookmarks: [
            { id: 'bm-s4', parentStackId: 'st-side-design', title: 'Figma', url: 'https://figma.com' },
            { id: 'bm-s5', parentStackId: 'st-side-design', title: 'Excalidraw', url: 'https://excalidraw.com' },
            { id: 'bm-s6', parentStackId: 'st-side-design', title: 'Tailwind docs', url: 'https://tailwindcss.com/docs' },
          ],
        },
      ],
    },
  ],
}
