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
  version: '0.9.2',
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
  // 0.8.0: `search` lets a go link with no match fall back to the person's default search engine.
  // Chrome shows no install warning for it (permissions list, and checked in Chrome for Testing
  // with getPermissionWarningsByManifest in the e2e suite), so updating needs no new consent.
  permissions: ['bookmarks', 'favicon', 'tabs', 'storage', 'tabGroups', 'search'],
  // 0.8.0 (Teams): an IT admin can set a company board through Chrome policy (Google Admin,
  // Intune, Group Policy, a macOS profile). The schema adds no permission and no install
  // warning; the extension reads the values with chrome.storage.managed.
  storage: { managed_schema: 'managed_schema.json' },
  // 0.8.0 (share a stack, T4): getstackboard.com/s may ask whether Stackboard is installed and
  // hand it a shared stack, which the person then confirms in a Stackboard tab. No permission and
  // no install warning. Listing only web pages also stops other extensions messaging this one,
  // which nothing relied on. Tests reach it by serving the page from that origin in puppeteer.
  externally_connectable: { matches: ['https://getstackboard.com/*'] },
  // 0.8.0 (Teams T6, free for everyone): go links. Typing "go" and a space in the address bar hands
  // the rest to the service worker, which suggests links by name. A manifest key, no permission.
  omnibox: { keyword: 'go' },
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
