// Runs in a DOM context. Use Chrome's built-in Summarizer API here.
async function summarize(text) {
  if (typeof Summarizer === 'undefined') throw new Error('Summarizer API unavailable');
  const avail = await Summarizer.availability();

  if (avail === 'downloadable' || avail === 'downloading') {
    // No user gesture here, so instruct the popup path
    throw new Error('Model not ready. Open the extension popup and click “Enable on-device summarizer” once.');
  }
  if (avail === 'unavailable') throw new Error('On-device model not supported on this device.');

  const summarizer = await Summarizer.create({ type: 'key-points', format: 'markdown', length: 'medium' });
  const out = await summarizer.summarize(text, { context: 'Audience: student; concise.' });
  return typeof out === 'string' ? out : out?.summary || '';
}


chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.scope !== "offscreen") return;
    try {
      if (msg.type === "SUMMARIZE") {
        const text = await summarize(msg.payload.text);
        sendResponse({ ok: true, text });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // async
});
