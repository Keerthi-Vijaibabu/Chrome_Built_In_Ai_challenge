// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // ------- Elements (declare ONCE) -------
  const btnEnable    = document.getElementById('btnEnable');
  const sumOut       = document.getElementById('sumOut');
  const sumText      = document.getElementById('sumText');
  const btnSummarize = document.getElementById('btnSummarize');
  const structText   = document.getElementById('structText');
  const structOut    = document.getElementById('structOut');
  const savedList    = document.getElementById('savedList');
  const cmpOut       = document.getElementById('cmpOut');
  const cmpViz       = document.getElementById('cmpViz');
  const cardText     = document.getElementById('cardText');
  const cardList     = document.getElementById('cardList');

  // ------- Tabs -------
  const tabs = document.querySelectorAll('nav button');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.toggle('active', b === btn));
    panels.forEach(p => p.classList.toggle('active', p.id === btn.dataset.tab));
  }));

  // ------- Enable on-device Summarizer (first-time download) -------
async function init() {
  const btnEnable = document.getElementById('btnEnable');
  const sumOut    = document.getElementById('sumOut');

  // If we already prepared earlier, reflect it in UI.
  const { sb_ready } = await chrome.storage.local.get('sb_ready');
  if (sb_ready) markReady();

  btnEnable.addEventListener('click', onEnableClick);

  async function onEnableClick() {
    try {
      // 1) Feature detect
      if (typeof Summarizer === 'undefined') {
        sumOut.textContent = 'Summarizer API not available in this Chrome.';
        return;
      }

      // 2) Check availability
      const avail = await Summarizer.availability(); // 'ready' | 'downloadable' | 'downloading' | 'unavailable'
      if (avail === 'unavailable') {
        sumOut.textContent = 'On-device model not supported on this device.';
        return;
      }

      // 3) Create summarizer in response to THIS click (user gesture)
      sumOut.textContent = (avail === 'ready')
        ? 'Model is ready. Warming up…'
        : 'Starting model download…';

      const summarizer = await Summarizer.create({
        type: 'key-points',
        format: 'markdown',
        length: 'medium',
        output: { language: "en" },
        // Progress events while Chrome fetches the model
        monitor(m) {
          m.addEventListener('downloadprogress', e => {
            // e.loaded may be bytes or a counter; show as-is
            sumOut.textContent = `Downloading model… ${e.loaded ?? ''}`;
          });
        }
      });

      // 4) Warmup (small run finalizes readiness)
      await summarizer.summarize('Ready check.');
      await chrome.storage.local.set({ sb_ready: true });
      markReady();
    } catch (err) {
      sumOut.textContent = 'Prep error: ' + (err?.message || String(err));
    }
  }

  function markReady() {
    btnEnable.textContent = 'Ready ✓';
    btnEnable.disabled = true;
    btnEnable.classList.add('accent');
    sumOut.textContent = 'On-device summarizer is ready.';
  }
}
  init();

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// helper injected into the page to collect text
function __grabTextFromPage() {
  // 1) selection first
  const sel = (window.getSelection && window.getSelection().toString().trim()) || "";
  if (sel) return { text: sel, source: "selection" };

  // 2) try article/main/role="main"
  const buckets = Array.from(document.querySelectorAll("article, main, [role='main']"));
  let txt = buckets.map(el => el.innerText || "").join(" ");

  // 3) fallback to body text
  if (!txt.trim()) txt = document.body?.innerText || "";

  // normalize spaces and limit size (Summarizer doesn't need EVERYTHING)
  txt = txt.replace(/\s+/g, " ").trim();
  const MAX = 60000; // ~60k chars for safety
  if (txt.length > MAX) txt = txt.slice(0, MAX);
  return { text: txt, source: "page" };
}

// ---- Summarize button ----
btnSummarize?.addEventListener("click", async () => {
  try {
    // ensure model available
    if (typeof Summarizer === "undefined") {
      sumOut.textContent = "Summarizer API not available in this Chrome.";
      return;
    }

    // collect text from the active tab
    sumOut.textContent = "Collecting text…";
    const tabId = await getActiveTabId();
    if (!tabId) { sumOut.textContent = "No active tab."; return; }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: __grabTextFromPage
    });

    const { text, source } = result || {};
    if (!text || text.length < 40) {
      sumOut.textContent = "Couldn't read this page. Select some text and try again.";
      return;
    }

    // make/create the summarizer (use output language)
    sumOut.textContent = `Summarizing ${source === "selection" ? "selection" : "page"}…`;
    const summarizer = await Summarizer.create({
      type: "key-points",
      format: "markdown",
      length: "medium",
      output: { language: "en" }
    });

    // optional: short context to shape style
    const raw = await summarizer.summarize(text, {
      output: { language: "en" },
      context: "Audience: student; crisp bullet points; keep numbers; <= 8 bullets."
    });

    const summary = typeof raw === "string" ? raw : raw?.summary || "";
    sumOut.textContent = summary || "No summary produced.";
  } catch (err) {
    // PDF viewer and some special pages can be restricted; selection still works
    sumOut.textContent = "Summarize error: " + (err?.message || String(err));
  }
});

  // ------- Structured preview -------
  document.getElementById('btnStruct').addEventListener('click', () => {
    const base = (structText.value || '').trim()
      || 'We evaluate a CNN on CIFAR-10 using data augmentation.';
    structOut.textContent =
      `**Objective**: Summarize: ${base.slice(0,60)}...` +
      `\n\n**Method**: Supervised training with augmentation.` +
      `\n\n**Dataset**: CIFAR-10 (50k train, 10k test).` +
      `\n\n**Results**: ~92% accuracy, robust to flips/crops.` +
      `\n\n**Conclusion**: Augmentation improves generalization.`;
  });

  // ------- Compare preview -------
  const mockSaved = [
    { t: '2025-10-27 14:32', o: 'CNN with data aug on CIFAR-10' },
    { t: '2025-10-26 19:10', o: 'ViT small on ImageNet subset' },
    { t: '2025-10-25 09:55', o: 'RNN vs LSTM on IMDB sentiment' }
  ];
  savedList.innerHTML = mockSaved.map((m,i)=>
    `<label><input type="checkbox" data-i="${i}"/> <b>${m.t}</b><span class="right">${m.o}</span></label>`
  ).join('');

  document.getElementById('btnCompare').addEventListener('click', () => {
    cmpOut.textContent = `**Common findings**
- Augmentation helps
- Transformer scales well

**Key differences**
- CNN trains faster
- ViT needs more data

**Quality flags**
- Small sample in run #2

**Best for**
- Quick baselines (CNN)
- Long-run accuracy (ViT)`;
    drawBars({common:2, diff:2, flags:1, best:2});
  });

  function drawBars(counts){
    const ctx = cmpViz.getContext('2d');
    const keys = [['Common findings','common'],['Key differences','diff'],['Quality flags','flags'],['Best for','best']];
    const W = cmpViz.width, H = cmpViz.height; ctx.clearRect(0,0,W,H);
    const gap = 12, barH = (H - gap*(keys.length+1)) / keys.length;
    const maxV = Math.max(1, counts.common, counts.diff, counts.flags, counts.best);
    ctx.font = '12px system-ui'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e5e7eb';
    keys.forEach((kv,i)=>{
      const [label,key] = kv; const v = counts[key];
      const y = gap + i*(barH+gap);
      ctx.fillStyle = '#1f2937'; ctx.fillRect(110, y, W-130, barH);
      ctx.fillStyle = '#6ee7b7'; ctx.fillRect(110, y, (W-130)*(v/maxV), barH);
      ctx.fillStyle = '#cbd5e1'; ctx.fillText(label, 8, y+barH/2);
      ctx.fillStyle = '#93c5fd'; ctx.fillText(String(v), W-12, y+barH/2);
    });
  }

  // ------- Cards preview -------
  document.getElementById('btnCard').addEventListener('click', ()=>{
    const q = (cardText.value.trim() || 'What is overfitting?').slice(0,80);
    const a = 'Model memorizes training data and fails to generalize.';
    const li = document.createElement('li');
    li.innerHTML = `<div><b>Q:</b> ${q}</div><div><b>A:</b> ${a}</div>`;
    cardList.prepend(li);
  });
  document.getElementById('btnExplain').addEventListener('click', ()=>{
    alert('Explain (preview): Overfitting means the model fits noise in training data and performs poorly on new data.');
  });

  // ------- Settings preview -------
  document.getElementById('cloudSync').addEventListener('change', (e)=>{
    alert(e.target.checked ? 'Cloud sync enabled (preview)' : 'Cloud sync disabled');
  });
  document.getElementById('btnClear').addEventListener('click', ()=>{
    cardList.innerHTML = '';
    sumOut.textContent = '';
    structOut.textContent = '';
    cmpOut.textContent = '';
    alert('Local data cleared (preview)');
  });
});
