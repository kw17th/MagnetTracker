/*
   MagnetTracker Background Service Worker
   This script runs in the background of the Chrome Extension.
   You can use it for:
   1. Periodically checking for updates (using chrome.alarms)
   2. Showing notifications when new magnets are found
   3. Syncing data across devices
*/

const STORAGE_KEY_SYNC = 'magnettracker_sync';

// Initialize context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[MagnetTracker] Extension installed/updated');
  
  // Clean up any existing menus first to avoid "duplicate ID" errors
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-to-magnettracker",
      title: "添加链接到 MagnetTracker",
      contexts: ["link"]
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "add-to-magnettracker") {
    const linkUrl = info.linkUrl;
    if (!linkUrl) {
      console.warn('[MagnetTracker] No link URL found in context menu click.');
      return;
    }

    console.log('[MagnetTracker] Context menu clicked for:', linkUrl);

    try {
      // Get current sync data - ensure we handle the result correctly
      const result = await chrome.storage.sync.get(STORAGE_KEY_SYNC);
      const syncData = result && result[STORAGE_KEY_SYNC] ? result[STORAGE_KEY_SYNC] : [];

      // Deduplicate
      if (syncData.find(item => item.url === linkUrl)) {
        showNotification('已在追踪中', '该链接已在您的追踪列表中');
        return;
      }

      // Add new entry with placeholder title
      const newEntry = {
        id: Date.now().toString(),
        url: linkUrl,
        title: '新追踪资源 (待刷新)...',
        copiedHashes: []
      };

      syncData.push(newEntry);
      await chrome.storage.sync.set({ [STORAGE_KEY_SYNC]: syncData });

      console.log('[MagnetTracker] Successfully added link to sync storage.');
      showNotification('添加成功', `已开始追踪链接: ${linkUrl}`);
    } catch (err) {
      console.error('[MagnetTracker] Context menu storage error:', err);
      showNotification('错误', '保存失败: ' + (err.message || '未知错误'));
    }
  }
});

function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon.png'), // Use absolute URL for the icon
      title: title,
      message: message,
      priority: 2
    }, (id) => {
      if (chrome.runtime.lastError) {
        console.error('[MagnetTracker] Notification error:', chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.error('[MagnetTracker] Notification catch:', e);
  }
}
