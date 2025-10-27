const OFFSCREEN_URL = chrome.runtime.getURL("src/summariser/offscreen/offscreen.html");

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["IFRAME_SCRIPTING"],
    justification: "Use built-in Summarizer API from a DOM context."
  });
}

// When the toolbar icon is clicked: extract text from page, summarize.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  // 1) Ask content script for text
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/summariser/content.js"] });
  const { text } = await chrome.tabs.sendMessage(tab.id, { type: "GET_TEXT" });

  if (!text || text.trim().length < 40) {
    chrome.tabs.sendMessage(tab.id, { type: "TOAST", payload: { text: "Not enough text found." } });
    return;
  }

  // 2) Summarize via offscreen
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({
    scope: "offscreen",
    type: "SUMMARIZE",
    payload: { text }
  });

  // 3) Show result on the page
  chrome.tabs.sendMessage(tab.id, {
    type: "TOAST",
    payload: { text: result?.ok ? result.text : ("Error: " + (result?.error || "Unknown")) }
  });
});

// Clean up offscreen when Chrome suspends the worker
chrome.runtime.onSuspend.addListener(async () => {
  if (await chrome.offscreen.hasDocument?.()) {
    await chrome.offscreen.closeDocument();
  }
});
