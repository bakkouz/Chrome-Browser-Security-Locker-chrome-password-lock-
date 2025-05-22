// background.js
const SETUP_PAGE = chrome.runtime.getURL("setup.html");
const LOCK_PAGE = chrome.runtime.getURL("lock.html");
const PASSWORD_STORAGE_KEY = 'browserLockerPasswordHash';
const SETUP_COMPLETE_KEY = 'browserLockerSetupComplete';
const ATTEMPTS_KEY = 'browserLockerAttemptsRemaining';
const IS_LOCKED_SESSION_KEY = 'browserLockerIsLockedSession';
const MAX_ATTEMPTS = 3;

// Hashing function
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Tab redirection with better error handling
async function redirectToPage(tabId, url) {
    try {
        await chrome.tabs.update(tabId, { url });
    } catch (error) {
        console.log(`Creating new tab with ${url} (redirect failed)`);
        await chrome.tabs.create({ url });
    }
}

// Locking logic
async function handleLocking(tabId) {
    const { [SETUP_COMPLETE_KEY]: isSetupComplete, [IS_LOCKED_SESSION_KEY]: isLocked } = await chrome.storage.local.get([SETUP_COMPLETE_KEY, IS_LOCKED_SESSION_KEY]);
    
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url) return;

        if (isLocked && !tab.url.includes('lock.html') && !tab.url.includes('setup.html')) {
            console.log(`Locking tab ${tabId}`);
            await redirectToPage(tabId, LOCK_PAGE);
        } else if (!isSetupComplete && !tab.url.includes('setup.html')) {
            console.log(`Redirecting to setup ${tabId}`);
            await redirectToPage(tabId, SETUP_PAGE);
        }
    } catch (e) {
        console.log(`Tab ${tabId} not available for locking check`);
    }
}

// Startup initialization
chrome.runtime.onStartup.addListener(async () => {
    console.log("Extension starting up");
    const { [SETUP_COMPLETE_KEY]: isSetupComplete } = await chrome.storage.local.get(SETUP_COMPLETE_KEY);
    
    await chrome.storage.local.set({
        [IS_LOCKED_SESSION_KEY]: true,
        [ATTEMPTS_KEY]: isSetupComplete ? MAX_ATTEMPTS : undefined
    });

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetUrl = isSetupComplete ? LOCK_PAGE : SETUP_PAGE;
    
    if (activeTab) {
        await redirectToPage(activeTab.id, targetUrl);
    } else {
        await chrome.tabs.create({ url: targetUrl });
    }
});

// Tab event handlers
chrome.tabs.onCreated.addListener(tab => setTimeout(() => handleLocking(tab.id), 100));
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.url) await handleLocking(tabId);
});

// Message handling - FIXED UNLOCK LOGIC
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setupPassword') {
        chrome.storage.local.set({
            [PASSWORD_STORAGE_KEY]: request.hashedPassword,
            [SETUP_COMPLETE_KEY]: true,
            [ATTEMPTS_KEY]: MAX_ATTEMPTS,
            [IS_LOCKED_SESSION_KEY]: true
        }, async () => {
            if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id);
            await chrome.tabs.create({ url: LOCK_PAGE });
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'attemptUnlock') {
        chrome.storage.local.get([PASSWORD_STORAGE_KEY, ATTEMPTS_KEY], async (result) => {
            const attempts = result[ATTEMPTS_KEY] ?? MAX_ATTEMPTS;

            if (request.enteredPasswordHash === result[PASSWORD_STORAGE_KEY]) {
                // Successful unlock
                await chrome.storage.local.set({
                    [IS_LOCKED_SESSION_KEY]: false,
                    [ATTEMPTS_KEY]: MAX_ATTEMPTS
                });

                // Open Chrome's New Tab page
                await chrome.tabs.create({ url: 'chrome://newtab' });

                sendResponse({ success: true, unlocked: true });
            } else {
                // Failed attempt
                const newAttempts = attempts - 1;
                await chrome.storage.local.set({ [ATTEMPTS_KEY]: newAttempts });

                if (newAttempts <= 0) {
                    sendResponse({
                        success: true,
                        unlocked: false,
                        attemptsRemaining: 0,
                        shuttingDown: true
                    });
                } else {
                    sendResponse({
                        success: true,
                        unlocked: false,
                        attemptsRemaining: newAttempts
                    });
                }
            }
        });
        return true; // Keep the listener active for async operations
    }

    if (request.action === 'requestAttempts') {
        chrome.storage.local.get(ATTEMPTS_KEY, result => {
            sendResponse({ attemptsRemaining: result[ATTEMPTS_KEY] ?? MAX_ATTEMPTS });
        });
        return true;
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'shutdownChrome') {
        console.log("Shutdown message received. Chrome will shut down in 5 seconds...");

        // Add a 5-second delay before shutting down Chrome
        setTimeout(() => {
            console.log("Closing all Chrome windows...");
            chrome.windows.getAll({}, (windows) => {
                windows.forEach((window) => {
                    chrome.windows.remove(window.id);
                });
            });
        }, 5000); // 5-second delay

        sendResponse({ success: true });
    }
});