/*
   MagnetTracker Background Service Worker
   This script runs in the background of the Chrome Extension.
   You can use it for:
   1. Periodically checking for updates (using chrome.alarms)
   2. Showing notifications when new magnets are found
   3. Syncing data across devices
*/

// Example: Initialize background tasks
chrome.runtime.onInstalled.addListener(() => {
    console.log('磁力追踪器扩展已安装');
    // Initialize storage if needed
});

// For now, most logic resides in the popup (app.js)
