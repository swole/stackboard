import type { PlannedSpace } from './importPlan'

// Ready-made spaces for an empty board (0.4.0). Well-known, long-lived URLs only; each pack
// is an ordinary space once added, so people edit or delete it like anything else.

export interface StarterPack extends PlannedSpace {
  id: string
  blurb: string
}

const L = (title: string, url: string) => ({ title, url })

export const STARTER_PACKS: StarterPack[] = [
  {
    id: 'everyday',
    name: 'Everyday',
    emoji: '🧭',
    blurb: 'Mail, calendar, maps and a few good reads',
    stacks: [
      {
        title: 'Daily',
        links: [
          L('Gmail', 'https://mail.google.com/'),
          L('Google Calendar', 'https://calendar.google.com/'),
          L('Google Drive', 'https://drive.google.com/'),
          L('YouTube', 'https://www.youtube.com/'),
          L('Google Maps', 'https://www.google.com/maps'),
        ],
      },
      {
        title: 'Read',
        links: [
          L('Wikipedia', 'https://www.wikipedia.org/'),
          L('Hacker News', 'https://news.ycombinator.com/'),
          L('BBC News', 'https://www.bbc.com/news'),
          L('Reddit', 'https://www.reddit.com/'),
        ],
      },
      {
        title: 'Handy',
        links: [
          L('Google Translate', 'https://translate.google.com/'),
          L('Weather', 'https://weather.com/'),
          L('Speedtest', 'https://www.speedtest.net/'),
          L('Google Keep', 'https://keep.google.com/'),
        ],
      },
    ],
  },
  {
    id: 'developer',
    name: 'Developer',
    emoji: '💻',
    blurb: 'Docs, tools and places to learn',
    stacks: [
      {
        title: 'Code',
        links: [
          L('GitHub', 'https://github.com/'),
          L('Stack Overflow', 'https://stackoverflow.com/'),
          L('MDN Web Docs', 'https://developer.mozilla.org/'),
          L('DevDocs', 'https://devdocs.io/'),
          L('npm', 'https://www.npmjs.com/'),
        ],
      },
      {
        title: 'Tools',
        links: [
          L('regex101', 'https://regex101.com/'),
          L('Can I use', 'https://caniuse.com/'),
          L('crontab guru', 'https://crontab.guru/'),
          L('Excalidraw', 'https://excalidraw.com/'),
          L('CodePen', 'https://codepen.io/'),
        ],
      },
      {
        title: 'Learn',
        links: [
          L('roadmap.sh', 'https://roadmap.sh/'),
          L('freeCodeCamp', 'https://www.freecodecamp.org/'),
          L('web.dev', 'https://web.dev/'),
          L('The Odin Project', 'https://www.theodinproject.com/'),
        ],
      },
    ],
  },
  {
    id: 'design',
    name: 'Design',
    emoji: '🎨',
    blurb: 'Inspiration, tools and free assets',
    stacks: [
      {
        title: 'Inspiration',
        links: [
          L('Dribbble', 'https://dribbble.com/'),
          L('Behance', 'https://www.behance.net/'),
          L('Mobbin', 'https://mobbin.com/'),
          L('Awwwards', 'https://www.awwwards.com/'),
        ],
      },
      {
        title: 'Tools',
        links: [
          L('Figma', 'https://www.figma.com/'),
          L('Coolors', 'https://coolors.co/'),
          L('Google Fonts', 'https://fonts.google.com/'),
          L('remove.bg', 'https://www.remove.bg/'),
        ],
      },
      {
        title: 'Assets',
        links: [
          L('Unsplash', 'https://unsplash.com/'),
          L('Lucide icons', 'https://lucide.dev/'),
          L('Phosphor Icons', 'https://phosphoricons.com/'),
          L('unDraw', 'https://undraw.co/'),
        ],
      },
    ],
  },
  {
    id: 'study',
    name: 'Study',
    emoji: '📚',
    blurb: 'Research, courses and writing help',
    stacks: [
      {
        title: 'Research',
        links: [
          L('Google Scholar', 'https://scholar.google.com/'),
          L('Semantic Scholar', 'https://www.semanticscholar.org/'),
          L('arXiv', 'https://arxiv.org/'),
          L('Zotero', 'https://www.zotero.org/'),
        ],
      },
      {
        title: 'Learn',
        links: [
          L('Khan Academy', 'https://www.khanacademy.org/'),
          L('Coursera', 'https://www.coursera.org/'),
          L('Wolfram|Alpha', 'https://www.wolframalpha.com/'),
          L('Desmos', 'https://www.desmos.com/calculator'),
        ],
      },
      {
        title: 'Write',
        links: [
          L('Google Docs', 'https://docs.google.com/document/'),
          L('Purdue OWL', 'https://owl.purdue.edu/'),
          L('Thesaurus.com', 'https://www.thesaurus.com/'),
        ],
      },
    ],
  },
  {
    id: 'work',
    name: 'Work',
    emoji: '💼',
    blurb: 'Inbox, meetings and shared docs',
    stacks: [
      {
        title: 'Today',
        links: [
          L('Outlook', 'https://outlook.office.com/mail/'),
          L('Gmail', 'https://mail.google.com/'),
          L('Google Calendar', 'https://calendar.google.com/'),
          L('Slack', 'https://app.slack.com/client'),
          L('Zoom', 'https://zoom.us/'),
        ],
      },
      {
        title: 'Docs',
        links: [
          L('Google Docs', 'https://docs.google.com/document/'),
          L('Google Sheets', 'https://docs.google.com/spreadsheets/'),
          L('Notion', 'https://www.notion.so/'),
          L('Miro', 'https://miro.com/'),
        ],
      },
    ],
  },
]
