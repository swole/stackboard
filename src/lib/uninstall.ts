// Uninstall page (0.5.5, 2026-10-20). When someone removes Stackboard, Chrome opens this page:
// it says their bookmarks are still in Chrome and asks, optionally, why they left. Only the version
// rides along in the URL; the page sends an answer only if the person presses Send (privacy page,
// "If you uninstall"). Kept free of chrome.* and storage so the service worker and the tests can use it.
export const UNINSTALL_PAGE = 'https://getstackboard.com/bye'

/** Chrome caps the uninstall URL at 1023 characters; a version string never comes close. */
export function uninstallUrl(version: string): string {
  return `${UNINSTALL_PAGE}?v=${encodeURIComponent(version)}`
}
