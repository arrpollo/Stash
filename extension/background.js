importScripts('content/playback-data.js');

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('index.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
// No content scripts can read the saved library.
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

// Relay verified embedded-player failures to the Reddit page in the same tab.
// The content script matches the GIF to its own post card, including in feeds.
// No page-supplied destination, media URL, or saved-library data is accepted.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'stash:embed-failed') {
    const report = StashRedditPlayback.failureReport(sender, chrome.runtime.id);
    if (report) chrome.tabs.sendMessage(sender.tab.id, { type: 'stash:use-reddit-preview', ...report }, { frameId: 0 }).catch(() => {});
  } else if (message?.type === 'stash:playback-ready' && sender.id === chrome.runtime.id && sender.frameId === 0 &&
      Number.isInteger(sender.tab?.id) && StashRedditPlayback.redditPageURL(sender.url)) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'stash:check-embed' }).catch(() => {});
  }
});
