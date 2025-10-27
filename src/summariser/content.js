// Heuristic page-text extraction: prefer selection; else main/article; else body.
function extractPageText() {
  const sel = window.getSelection?.().toString().trim();
  if (sel && sel.length > 0) return sel;

  const pick = (sel) => document.querySelector(sel)?.innerText?.trim();
  const main = pick("article, main");
  if (main && main.length > 200) return main;

  const body = document.body?.innerText?.trim() || "";
  // cap very long pages to avoid huge prompts
  return body.length > 20000 ? body.slice(0, 20000) : body;
}

// Minimal toast
function toast(t) {
  let host = document.getElementById("ls_toast_host");
  if (!host) {
    host = Object.assign(document.createElement("div"), { id: "ls_toast_host" });
    Object.assign(host.style, {
      position: "fixed", right: "12px", bottom: "12px", zIndex: 999999, maxWidth: "420px"
    });
    document.body.appendChild(host);
  }
  const card = document.createElement("div");
  Object.assign(card.style, {
    background: "#111", color: "#fff", padding: "10px 12px", borderRadius: "10px",
    marginTop: "8px", font: "13px system-ui", whiteSpace: "pre-wrap", lineHeight: "1.35"
  });
  card.textContent = t;
  host.appendChild(card);
  setTimeout(() => card.remove(), 8000);
}

chrome.runtime.onMessage.addListener((m, _s, sendResponse) => {
  if (m?.type === "GET_TEXT") {
    sendResponse({ text: extractPageText() });
  }
  if (m?.type === "TOAST") {
    toast(m.payload.text || "");
  }
});
