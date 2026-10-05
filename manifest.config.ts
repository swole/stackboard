import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  // Renamed from "Stackable" in 0.3.0: stackable.so publishes a featured extension under
  // that name and developer name. The store title is this field; short_name is for tight UI.
  // 0.4.0: title carries the words people search the store for ("bookmark manager", "new tab").
  name: 'Stackboard: Bookmark Manager & New Tab Spaces',
  short_name: 'Stackboard',
  version: '0.5.0',
  description:
    'Your new tab as a board of bookmark stacks: speed dial, spaces and search, saved as Chrome bookmarks. Synced, offline, no account.',
  chrome_url_overrides: {
    newtab: 'newtab.html',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  commands: {
    'stash-window': {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Stash this window: save every tab into a stack, then close them',
    },
  },
  action: {
    default_popup: 'popup.html',
    default_title: 'Save current tab to Stackboard',
  },
  permissions: ['bookmarks', 'favicon', 'tabs', 'storage', 'tabGroups'],
  icons: {
    16: 'icons/16.png',
    48: 'icons/48.png',
    128: 'icons/128.png',
  },
  web_accessible_resources: [
    {
      resources: ['_favicon/*'],
      matches: ['<all_urls>'],
    },
  ],
})
