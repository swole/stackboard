import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  // Renamed from "Stackable" in 0.3.0: stackable.so publishes a featured extension under
  // that name and developer name. The store title is this field; short_name is for tight UI.
  // 0.4.0: title carries the words people search the store for ("bookmark manager", "new tab").
  // 0.5.1: name and description come from public/_locales (G3), so each store language gets its own
  // searchable title. English stays the default; tests/unit.test.ts checks every locale's lengths.
  default_locale: 'en',
  name: '__MSG_extName__',
  short_name: '__MSG_extShortName__',
  version: '0.5.1',
  description: '__MSG_extDescription__',
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
