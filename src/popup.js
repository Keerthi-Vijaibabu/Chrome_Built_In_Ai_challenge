// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // =========================
  // Elements (query once)
  // =========================
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

  const pdfInput     = document.getElementById('pdfFile');

  // =========================
  // Tabs
  // =========================
  const tabs   = document.querySelectorAll('nav button');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.toggle('active', b === btn));
    panels.forEach(p => p.classList.toggle('active', p.id === btn.dataset.tab));
  }));

  // =========================
  // Storage helpers (recent list)
  // =========================
  const SB_KEY = 'sb_recent';
  const SB_MAX = 60;

  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sbList() {
    const { [SB_KEY]: list = [] } = await chrome.storage.local.get(SB_KEY);
    return Array.isArray(list) ? list : [];
  }

  async function sbSave(item) {
    const list = await sbList();
    const canon = item.kind === 'structured'
      ? JSON.stringify(item.omdrc || {})
      : (item.text || '');
    item.hash = await sha256(`${item.kind}|${canon.trim()}`);

    const i = list.findIndex(x => x.hash === item.hash);
    if (i >= 0) list.splice(i, 1);          // move-to-front on duplicate

    list.unshift(item);
    if (list.length > SB_MAX) list.length = SB_MAX;
    await chrome.storage.local.set({ [SB_KEY]: list });
    return item.id;
  }

  async function sbGetMany(ids) {
    const list = await sbList();
    const set = new Set(ids);
    return list.filter(x => set.has(x.id));
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function firstSentence(s, max = 120) {
    if (!s) return "";
    let t = s.replace(/\s+/g, " ").trim();
    const m = t.match(/.*?[.!?](\s|$)/);
    t = m ? m[0] : t.slice(0, max);
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  function autoName(item) {
    if (item.title && item.title.trim().length > 8) return item.title.trim();
    if (item.kind === 'structured' && item.omdrc?.Objective)
      return firstSentence(item.omdrc.Objective, 80);

    const base = (item.text || "").replace(/^[-•*\s]+/gm, "").trim();
    const sent = firstSentence(base, 80);
    if (sent) return sent;

    return `Summary ${new Date(item.when || Date.now()).toLocaleString()}`;
  }

  async function refreshCompareList() {
    const list = await sbList();   // newest first
    if (!savedList) return;
    savedList.innerHTML =
      list.slice(0, 40).map(item => {
        const name = autoName(item);
        const when = new Date(item.when).toLocaleString();
        const tag  = item.kind === 'structured' ? 'Structured' : 'Raw';
        return `
          <label data-id="${item.id}">
            <input type="checkbox" data-id="${item.id}"/>
            <b>${name}</b>
            <span class="right tag">${tag}</span>
            <div class="hint" style="width:100%">${when}</div>
          </label>`;
      }).join('') || `<div class="hint">No saved summaries yet — create one in Summarize/Structured.</div>`;
  }

  // =========================
  // Chrome helpers (single copy)
  // =========================
  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  function __grabTextFromPage() {
    const sel = (window.getSelection && window.getSelection().toString().trim()) || "";
    if (sel) return { text: sel, source: "selection" };

    const buckets = Array.from(document.querySelectorAll("article, main, [role='main']"));
    let txt = buckets.map(el => el.innerText || "").join(" ");
    if (!txt.trim()) txt = document.body?.innerText || "";

    txt = txt.replace(/\s+/g, " ").trim();
    const MAX = 60000;
    if (txt.length > MAX) txt = txt.slice(0, MAX);
    return { text: txt, source: "page" };
  }

  // =========================
  // Enable on-device Summarizer
  // =========================
  (async function initEnable() {
    if (!btnEnable || !sumOut) return;

    try {
      const { sb_ready } = await chrome.storage.local.get('sb_ready');
      if (sb_ready) markReady();
    } catch {}

    btnEnable.addEventListener('click', onEnableClick);

    async function onEnableClick() {
      try {
        if (typeof Summarizer === 'undefined') {
          sumOut.textContent = 'Summarizer API not available in this Chrome.';
          return;
        }

        const avail = await Summarizer.availability(); // 'ready' | 'downloadable' | 'downloading' | 'unavailable'
        if (avail === 'unavailable') {
          sumOut.textContent = 'On-device model not supported on this device.';
          return;
        }

        sumOut.textContent = (avail === 'ready') ? 'Model is ready. Warming up…' : 'Starting model download…';

        const summarizer = await Summarizer.create({
          type: 'key-points',
          format: 'markdown',
          length: 'medium',
          output: { language: "en" },
          monitor(m) {
            m.addEventListener('downloadprogress', e => {
              sumOut.textContent = `Downloading model… ${e.loaded ?? ''}`;
            });
          }
        });

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
  })();

  // =========================
  // Input priority (PDF > textarea > page)
  // =========================
  let pendingPdfFile = null;

  pdfInput?.addEventListener('change', (e) => {
    pendingPdfFile = e.target.files?.[0] || null;
  });

  sumText?.addEventListener('paste', (e) => {
    const f = e.clipboardData?.files?.[0];
    if (f && f.type === 'application/pdf') {
      pendingPdfFile = f;
      e.preventDefault();
    }
  });

  async function extractTextFromPDFFile(file, maxChars = 60000) {
    if (!window.pdfjsLib) throw new Error("PDF.js not loaded");
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map(i => i.str).join(' ') + '\n';
      if (out.length >= maxChars) break;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  async function getInputForSummarize() {
    if (pendingPdfFile) {
      const text = await extractTextFromPDFFile(pendingPdfFile);
      return { text, source: 'pdf' };
    }
    const typed = (sumText?.value || '').trim();
    if (typed) return { text: typed, source: 'textbox' };

    const tabId = await getActiveTabId();
    if (!tabId) return { text: '', source: 'none' };
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId }, func: __grabTextFromPage
    });
    return result || { text: '', source: 'none' };
  }

  // =========================
  // Chunked summarization helper
  // =========================
  async function summarizeChunked(longText) {
    const CHUNK = 8000, OVERLAP = 600;
    const sum = await Summarizer.create({
      type: "key-points", format: "markdown", length: "medium",
      output: { language: "en" }
    });

    let idx = 0, parts = [];
    while (idx < longText.length) {
      const slice = longText.slice(idx, idx + CHUNK);
      const raw = await sum.summarize(slice, { output: { language: "en" } });
      parts.push(typeof raw === "string" ? raw : raw?.summary || "");
      idx += CHUNK - OVERLAP;
    }

    const merged = await sum.summarize(parts.join("\n\n"), {
      output: { language: "en" },
      context: "Merge these bullets into a concise set; remove duplicates; keep numbers."
    });
    return (typeof merged === "string") ? merged : (merged?.summary || "");
  }

  // =========================
  // Summarize button
  // =========================
  btnSummarize?.addEventListener("click", async () => {
    try {
      if (typeof Summarizer === "undefined") {
        sumOut.textContent = "Summarizer API not available in this Chrome.";
        return;
      }

      sumOut.textContent = "Collecting input…";
      const { text, source } = await getInputForSummarize();

      if (!text || text.length < 40) {
        sumOut.textContent = "Nothing to summarize. Upload/paste a PDF, paste text, or select content on the page.";
        return;
      }

      sumOut.textContent = `Summarizing ${source}…`;

      const MAX_SINGLE = 12000;
      let summary;
      if (text.length > MAX_SINGLE) {
        summary = await summarizeChunked(text);
      } else {
        const summarizer = await Summarizer.create({
          type: "key-points", format: "markdown", length: "medium",
          output: { language: "en" }
        });
        const raw = await summarizer.summarize(text, {
          output: { language: "en" },
          context: "Audience: student; crisp bullet points; keep numbers; <= 8 bullets."
        });
        summary = (typeof raw === "string") ? raw : (raw?.summary || "");
      }

      sumOut.textContent = summary || "No summary produced.";

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await sbSave({
        id: newId(),
        when: new Date().toISOString(),
        kind: 'raw',
        source,                      // 'pdf' | 'textbox' | 'selection' | 'page'
        title: activeTab?.title,
        url: activeTab?.url,
        text: summary
      });
      refreshCompareList();
    } catch (err) {
      sumOut.textContent = "Summarize error: " + (err?.message || String(err));
    }
  });

  // =========================
  // Structured extraction
  // =========================
  function heuristicOMDRC(text) {
    const sents = text.split(/(?<=[.!?])\s+/).slice(0, 30);
    const pick = (regex, fallbackIdx) =>
      sents.find(s => regex.test(s)) || sents[fallbackIdx] || "N/A";
    const objective = pick(/\b(objective|goal|aim|purpose|we (investigate|study|propose))\b/i, 0);
    const method    = pick(/\b(method|approach|we (use|used|propose|train|trained)|architecture)\b/i, 1);
    const dataset   = pick(/\b(dataset|data set|corpus|sample|CIFAR|ImageNet|MNIST|IMDb|Wiki|UCI)\b/i, 2);
    const results   = pick(/\b(result|accuracy|improv|gain|F1|BLEU|AUC|error|%|significant)\b/i, 3);
    const conclusion= sents.slice(-2).join(" ") || "N/A";
    return { Objective: objective, Method: method, Dataset: dataset, Results: results, Conclusion: conclusion };
  }

  function renderOMDRC(data) {
    return `**Objective**: ${data.Objective}

**Method**: ${data.Method}

**Dataset**: ${data.Dataset}

**Results**: ${data.Results}

**Conclusion**: ${data.Conclusion}`;
  }

  document.getElementById('btnStruct')?.addEventListener('click', async () => {
    try {
      let source = 'textbox';
      let text = (structText?.value || '').trim();
      if (!text) {
        structOut.textContent = "Reading page text…";
        const tabId = await getActiveTabId();
        if (!tabId) { structOut.textContent = "No active tab."; return; }
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId }, func: __grabTextFromPage
        });
        text = result?.text || "";
        source = result?.source || 'page';
      }
      if (!text || text.length < 40) {
        structOut.textContent = "Please paste some content or select text.";
        return;
      }

      let data = null;

      if (window.ai?.languageModel?.create) {
        structOut.textContent = "Extracting with on-device Prompt API…";
        const schema = {
          type: "object", additionalProperties: false,
          required: ["Objective","Method","Dataset","Results","Conclusion"],
          properties: { Objective:{type:"string"}, Method:{type:"string"},
            Dataset:{type:"string"}, Results:{type:"string"}, Conclusion:{type:"string"} }
        };
        const session = await window.ai.languageModel.create({
          systemPrompt: "You are a careful research assistant. Output compact, factual JSON."
        });
        const prompt = `Extract Objective, Method, Dataset, Results, Conclusion (≤2 sentences each).
TEXT:
${text}`;
        const resp = await session.prompt(prompt, { response:{ format:"json", schema }, output:{ language:"en" }});
        data = (typeof resp === "string") ? JSON.parse(resp) : resp;
      } else if (typeof Summarizer !== "undefined") {
        structOut.textContent = "Extracting with Summarizer (JSON-coerced)…";
        const sum = await Summarizer.create({
          type:"key-points", format:"markdown", length:"medium", output:{ language:"en" }
        });
        const guidance = `Return ONLY JSON:
{"Objective":"","Method":"","Dataset":"","Results":"","Conclusion":""}`;
        const raw = await sum.summarize(text, { context: guidance, output:{ language:"en" }});
        const str = typeof raw === "string" ? raw : raw?.summary || "";
        const match = str.match(/\{[\s\S]*\}/);
        if (match) data = JSON.parse(match[0]);
      }

      if (!data) { structOut.textContent = "Extracting (heuristic)…"; data = heuristicOMDRC(text); }

      structOut.textContent = renderOMDRC(data);

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await sbSave({
        id: newId(),
        when: new Date().toISOString(),
        kind: 'structured',
        source,
        title: activeTab?.title,
        url: activeTab?.url,
        omdrc: data
      });
      refreshCompareList();
    } catch (err) {
      structOut.textContent = "Structured extraction error: " + (err?.message || String(err));
    }
  });
// =========================
// Compare: normalizers
// =========================
// ----- Visualization (define this ABOVE the compare handler) -----
function drawBars(counts) {
  const canvas = document.getElementById('cmpViz');
  if (!canvas) return;                        // no canvas in this tab
  const ctx = canvas.getContext('2d');
  const keys = [
    ['Common findings','common'],
    ['Key differences','diff'],
    ['Quality flags','flags'],
    ['Best for','best']
  ];
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const gap = 12, barH = (H - gap*(keys.length+1)) / keys.length;
  const maxV = Math.max(1, counts.common, counts.diff, counts.flags, counts.best);

  ctx.font = '12px system-ui';
  ctx.textBaseline = 'middle';

  keys.forEach((kv,i)=>{
    const [label,key] = kv; const v = counts[key] || 0;
    const y = gap + i*(barH+gap);
    // background
    ctx.fillStyle = '#1f2937'; ctx.fillRect(110, y, W-130, barH);
    // value
    ctx.fillStyle = '#6ee7b7'; ctx.fillRect(110, y, (W-130)*(v/maxV), barH);
    // labels
    ctx.fillStyle = '#cbd5e1'; ctx.fillText(label, 8, y+barH/2);
    ctx.fillStyle = '#93c5fd'; ctx.fillText(String(v), W-12, y+barH/2);
  });
}


// Try to lift ANY item into O/M/D/R/C.
// Uses Prompt API → Summarizer(JSON-coerce) → heuristicOMDRC (you already have).
async function normalizeItemToOMDRC(item) {
  // If it's already structured, passthrough.
  if (item.kind === 'structured' && item.omdrc) return item.omdrc;

  const text = (item.text || '').trim();
  if (!text) return { Objective: "N/A", Method: "N/A", Dataset: "N/A", Results: "N/A", Conclusion: "N/A" };

  // A) Prompt API (preferred)
  if (window.ai?.languageModel?.create) {
    const schema = {
      type: "object", additionalProperties: false,
      required: ["Objective","Method","Dataset","Results","Conclusion"],
      properties: { Objective:{type:"string"}, Method:{type:"string"},
        Dataset:{type:"string"}, Results:{type:"string"}, Conclusion:{type:"string"} }
    };
    const session = await window.ai.languageModel.create({
      systemPrompt: "You are a careful research assistant. Output compact, factual JSON only."
    });
    const prompt =
`Extract a compact structured summary with fields:
Objective, Method, Dataset, Results, Conclusion.
• Keep each ≤ 2 sentences.
• Preserve numbers/metrics.
• If unknown, use "N/A".

TEXT:
${text.slice(0, 6000)}`;
    try {
      const resp = await session.prompt(prompt, { response:{ format:"json", schema }, output:{ language:"en" } });
      return (typeof resp === "string") ? JSON.parse(resp) : resp;
    } catch { /* fallthrough */ }
  }

  // B) Summarizer (JSON-coerce)
  if (typeof Summarizer !== "undefined") {
    try {
      const sum = await Summarizer.create({
        type:"key-points", format:"markdown", length:"medium", output:{ language:"en" }
      });
      const guidance = `Return ONLY JSON with exactly:
{"Objective":"","Method":"","Dataset":"","Results":"","Conclusion":""}`;
      const raw = await sum.summarize(text.slice(0, 12000), { context: guidance, output:{ language:"en" } });
      const str = typeof raw === "string" ? raw : raw?.summary || "";
      const m = str.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch { /* fallthrough */ }
  }

  // C) Heuristic fallback (uses your existing function)
  return heuristicOMDRC(text);
}

// Normalize a list of items to the same shape.
async function normalizeAll(items) {
  const out = [];
  for (const it of items) {
    const omdrc = await normalizeItemToOMDRC(it);
    // Clamp each field so prompts stay small
    const clamp = s => (s || "N/A").replace(/\s+/g," ").trim().slice(0, 500);
    out.push({
      title: it.title || "Untitled",
      O: clamp(omdrc.Objective),
      M: clamp(omdrc.Method),
      D: clamp(omdrc.Dataset),
      R: clamp(omdrc.Results),
      C: clamp(omdrc.Conclusion),
    });
  }
  return out;
}

// Build a compact compare prompt from normalized items
function buildComparePrompt(normItems) {
  const blocks = normItems.map((n,i)=> 
`# Item ${i+1}: ${n.title}
Objective: ${n.O}
Method: ${n.M}
Dataset: ${n.D}
Results: ${n.R}
Conclusion: ${n.C}`).join('\n\n');

  return `Compare the items and return STRICT JSON ONLY:
{
  "summaryMd": "markdown bullets grouped by sections",
  "common":   ["shared finding ..."],
  "diff":     ["key difference ..."],
  "flags":    ["quality/risk flags ..."],
  "bestFor":  ["guidance like 'Item 2 for quick baselines'"]
}
Rules:
- ≤ 10 bullets total across sections.
- Be concise, factual, preserve numbers/metrics.
- Prefer field-wise contrasts (Objective/Method/Dataset/Results/Conclusion).

${blocks}`;
}

// ---------- Helpers for survey generation ----------

// Light normalizer for O/M/D/R/C objects or strings.
function normOMDRC(x) {
  if (!x || typeof x !== 'object') return {Objective:'',Method:'',Dataset:'',Results:'',Conclusion:''};
  const pick = k => (x[k] || '').toString().trim();
  return {
    Objective: pick('Objective'),
    Method:    pick('Method'),
    Dataset:   pick('Dataset'),
    Results:   pick('Results'),
    Conclusion:pick('Conclusion'),
  };
}

// Build a deterministic markdown survey without any model (fallback).
function buildSurveyDraft(items) {
  // Convert raw → heuristic O/M/D/R/C when needed
  const rows = items.map(it => {
    if (it.kind === 'structured') return {...it, omdrc: normOMDRC(it.omdrc)};
    // raw: try to squeeze a heuristic O/M/D/R/C from text
    const h = heuristicOMDRC(it.text || '');
    return {...it, omdrc: normOMDRC(h)};
  });

  // Buckets for quick analytics
  const methods  = {};
  const datasets = {};
  const metrics  = {};

  const pushCount = (map, key) => {
    if (!key) return;
    key.split(/[;,/]| and | with | using /i)
       .map(s => s.trim()).filter(Boolean)
       .forEach(k => { map[k] = (map[k] || 0) + 1; });
  };

  rows.forEach(r => {
    pushCount(methods,  r.omdrc.Method);
    pushCount(datasets, r.omdrc.Dataset);
    // naive metric scrape
    const m = (r.omdrc.Results || '').match(/\b(AUC|F1|BLEU|ROUGE|PSNR|SSIM|Acc(?:uracy)?|Recall|Precision)\b/gi);
    m && m.forEach(x => metrics[x] = (metrics[x] || 0) + 1);
  });

  const top = (obj, n=8) => Object.entries(obj)
     .sort((a,b)=>b[1]-a[1]).slice(0,n)
     .map(([k,v])=>`- ${k} (${v})`).join('\n') || '- N/A';

  const bib = rows.map((r,i) => {
    const title = autoName(r);
    const url   = r.url ? ` — ${r.url}` : '';
    return `- [P${i+1}] **${title}**${url}`;
  }).join('\n');

  const perPaper = rows.map((r,i) => {
    const T = autoName(r);
    const O = r.omdrc.Objective || 'N/A';
    const M = r.omdrc.Method    || 'N/A';
    const D = r.omdrc.Dataset   || 'N/A';
    const R = r.omdrc.Results   || 'N/A';
    const C = r.omdrc.Conclusion|| 'N/A';
    return `### P${i+1}. ${T}
- **Objective:** ${O}
- **Method:** ${M}
- **Dataset:** ${D}
- **Results:** ${R}
- **Conclusion:** ${C}\n`;
  }).join('\n');

  return `# Literature Survey

## Corpus
${bib}

## Method Overview (top)
${top(methods)}

## Dataset Landscape (top)
${top(datasets)}

## Reported Metrics (mentions)
${top(metrics)}

## Per-paper Summaries
${perPaper}

## Synthesis & Gaps (template)
- Common patterns: …  
- Differences in methodology/assumptions: …  
- Quality flags or threats to validity: …  
- Gaps / Open problems: …  
- Practical recommendations: …
`;
}

// Try to craft a fluent survey with the on-device Prompt API, else return null.
async function buildSurveyWithPromptAPI(items) {
  if (!window.ai?.languageModel?.create) return null;

  // Prepare compact sources
  const compact = items.map((it, idx) => {
    const title = (autoName(it) || `Paper ${idx+1}`).slice(0,160);
    if (it.kind === 'structured') {
      const o = normOMDRC(it.omdrc);
      return `P${idx+1}: ${title}\nObjective: ${o.Objective}\nMethod: ${o.Method}\nDataset: ${o.Dataset}\nResults: ${o.Results}\nConclusion: ${o.Conclusion}`;
    }
    // raw (already summarized text)
    const t = (it.text || '').slice(0, 1600);
    return `P${idx+1}: ${title}\nSummary: ${t}`;
  }).join('\n\n');

  const systemPrompt = `You are a meticulous research writer. Compose a concise, unbiased literature survey in Markdown.
- Keep it factual, cite items as [P1], [P2], …
- Sections: Introduction, Common Findings, Key Differences, Datasets & Metrics, Quality Flags/Limitations, Gaps & Future Work, Recommendations, References.
- Do not invent sources. Use only the provided material.`;

  const userPrompt = `Material:\n${compact}\n\nWrite the literature survey now.`;

  const session = await window.ai.languageModel.create({ systemPrompt });
  const resp = await session.prompt(userPrompt, { output: { language: 'en' } });
  const text = typeof resp === 'string' ? resp : (resp?.output || '');
  return (text && text.length > 50) ? text : null;
}

// Save .md to disk and clipboard
async function exportMarkdown(filename, md) {
  try {
    // download
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    // clipboard (best-effort)
    await navigator.clipboard.writeText(md);
  } catch (_) {}
}


// =========================
// Compare: engines (local only)
// =========================
async function compareNormalized(normItems) {
  const prompt = buildComparePrompt(normItems);

  // 1) Prompt API (on-device)
  if (window.ai?.languageModel?.create) {
    const schema = {
      type: "object", additionalProperties: false,
      required: ["summaryMd","common","diff","flags","bestFor"],
      properties: {
        summaryMd: { type:"string" },
        common:    { type:"array", items:{type:"string"} },
        diff:      { type:"array", items:{type:"string"} },
        flags:     { type:"array", items:{type:"string"} },
        bestFor:   { type:"array", items:{type:"string"} }
      }
    };
    const session = await window.ai.languageModel.create({
      systemPrompt: "Output compact, factual JSON exactly matching the schema."
    });
    const resp = await session.prompt(prompt, { response:{ format:"json", schema }, output:{ language:"en" } });
    return (typeof resp === "string") ? JSON.parse(resp) : resp;
  }

  // 2) Summarizer JSON-coercion
  if (typeof Summarizer !== "undefined") {
    const sum = await Summarizer.create({
      type:"key-points", format:"markdown", length:"medium", output:{ language:"en" }
    });
    const coerced = prompt + `

Return ONLY this JSON object:
{"summaryMd":"","common":[],"diff":[],"flags":[],"bestFor":[]}`;
    const raw = await sum.summarize(coerced, { output:{ language:"en" } });
    const str = typeof raw === "string" ? raw : raw?.summary || "";
    const m = str.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  }

  // 3) Heuristic fallback
  return heuristicCompare(normItems);
}

// Very small heuristic: intersects keywords, simple diffs, naive flags.
function heuristicCompare(normItems){
  const tok = s => (s||"").toLowerCase().split(/\W+/).filter(w=>w.length>3);
  const bag = n => [...tok(n.O),...tok(n.M),...tok(n.D),...tok(n.R),...tok(n.C)];

  const bags = normItems.map(bag);
  const sets = bags.map(b => new Set(b));

  // Common (pairwise intersection of first two as a proxy; extend if >2)
  let common = [];
  if (sets.length >= 2) {
    const a = sets[0], b = sets[1];
    common = [...a].filter(w => b.has(w)).slice(0,5).map(w => `Shared keyword: ${w}`);
  }

  // Differences: words unique to each (top few)
  const diff = [];
  sets.forEach((s, i) => {
    const others = new Set(bags.flat().filter((_, idx) => true));
    // crude: just show 3 unique tokens for each item
    const uniq = [...s].filter(w => !normItems.some((_,j)=> j!==i && sets[j].has(w))).slice(0,3);
    if (uniq.length) diff.push(`Item ${i+1} unique: ${uniq.join(', ')}`);
  });

  // Flags: look for telltale strings in Results/Method
  const flags = [];
  const red = /(pilot|small sample|subset|synthetic|no baseline|not significant|missing|overfit|leak|no cross[- ]?val|imbalanced)/i;
  normItems.forEach((n,i)=>{
    const blob = `${n.M} ${n.R}`;
    if (red.test(blob)) flags.push(`Item ${i+1}: potential quality concern (${blob.match(red)[0]})`);
  });

  // Best-for: naive—highest number in Results gets "accuracy"; shortest Method gets "quick baseline"
  const nums = normItems.map(n => {
    const m = (n.R.match(/(\d+(\.\d+)?)\s*%/) || [])[1];
    return m ? parseFloat(m) : -1;
  });
  const bestFor = [];
  const bestAccIdx = nums.indexOf(Math.max(...nums));
  if (bestAccIdx >= 0 && nums[bestAccIdx] >= 0) bestFor.push(`Item ${bestAccIdx+1}: best for accuracy`);
  let minMethodIdx = 0, minLen = Infinity;
  normItems.forEach((n,i)=>{ const L = n.M.length; if (L < minLen){ minLen=L; minMethodIdx=i; }});
  bestFor.push(`Item ${minMethodIdx+1}: best for quick baseline`);

  const summaryMd =
`- **Common findings**: ${common.length ? common.join('; ') : 'n/a'}
- **Key differences**: ${diff.length ? diff.join('; ') : 'n/a'}
- **Quality flags**: ${flags.length ? flags.join('; ') : 'n/a'}
- **Best-for**: ${bestFor.join('; ')}`;

  return { summaryMd, common, diff, flags, bestFor };
}
// =========================
// Compare (wire-up)
// =========================
document.getElementById('btnCompare')?.addEventListener('click', async () => {
  try {
    const ids = [...savedList.querySelectorAll('input[type="checkbox"]:checked')]
      .map(ch => ch.dataset.id);
    if (ids.length < 2) { cmpOut.textContent = 'Pick at least two items.'; return; }

    const items = await sbGetMany(ids);

    // Build a plain-text bag for quick overlap metrics
    const texts = items.map(x => x.kind === 'structured'
      ? Object.values(x.omdrc || {}).join(' ')
      : (x.text || ''));

    // naive tokenization + stopwords removal
    const STOP = new Set(['the','a','an','and','or','to','of','in','on','for','with','we','is','are','this','that','by','as','at','from','it','be','our','their','was','were']);
    const bags = texts.map(t => {
      const m = (t || '').toLowerCase().match(/[a-z0-9%\.]+/g) || [];
      return m.filter(w => !STOP.has(w));
    });

    // Common tokens across ALL
    const counts = new Map();
    bags.forEach(b => b.forEach(w => counts.set(w, (counts.get(w)||0)+1)));
    const common = [...counts.entries()].filter(([_,c]) => c === bags.length).map(([w])=>w).slice(0,10);

    // Differences: tokens that appear in exactly one bag
    const diffs = [...counts.entries()].filter(([_,c]) => c === 1).length;

    // Quick “quality flags”
    const flags = [];
    // 1) very short summary
    items.forEach((x,i) => { if ((texts[i]||'').length < 200) flags.push(`Short text in item #${i+1}`); });
    // 2) duplicate hashes (same content)
    const seen = new Set();
    items.forEach((x,i) => {
      const h = (x.hash || `${x.kind}:${(texts[i]||'').slice(0,120)}`);
      if (seen.has(h)) flags.push(`Duplicate-like content (#${i+1})`);
      seen.add(h);
    });

    // Best-for (toy rule): longest = more detailed
    const longestIdx = texts.reduce((bi,t,i)=> (t.length > texts[bi].length ? i : bi), 0);
    const bestFor = `Most detailed: “${(items[longestIdx].title || 'Item '+(longestIdx+1))}”`;

    // Write out
    cmpOut.textContent =
`**Common findings (top)**: ${common.join(', ') || '—'}
**Key differences (rough count)**: ${diffs}
**Quality flags**: ${flags.length ? flags.join('; ') : 'None'}
**Best for**: ${bestFor}`;

    // Bars (guarded)
    if (typeof drawBars === 'function') {
      drawBars({
        common: common.length,
        diff: diffs,
        flags: flags.length,
        best: 1
      });
    }
  } catch (e) {
    cmpOut.textContent = 'Compare failed: ' + (e?.message || String(e));
  }
});

document.getElementById('btnSurvey')?.addEventListener('click', async () => {
  try {
    const ids = [...savedList.querySelectorAll('input[type="checkbox"]:checked')]
      .map(ch => ch.dataset.id);
    if (ids.length < 2) {
      cmpOut.textContent = 'Pick at least two items to generate a literature survey.'; 
      return;
    }

    const items = await sbGetMany(ids);

    // 1) Try on-device Prompt API
    cmpOut.textContent = 'Generating literature survey…';
    let survey = await buildSurveyWithPromptAPI(items);

    // 2) Fallback: deterministic draft
    if (!survey) {
      survey = buildSurveyDraft(items);
      cmpOut.textContent = '(Fallback) Generated survey draft below.\n\n' + survey;
    } else {
      cmpOut.textContent = survey;
    }

    // Optional: trivial viz counts taken from the survey text
    const counts = {
      common:   (survey.match(/Common Findings|Common patterns/gi) ? 10 : 0),
      diff:     (survey.match(/Key Differences/gi) ? 13 : 0),
      flags:    (survey.match(/Quality Flags|limitations/gi) ? 1 : 0),
      best:     (survey.match(/Recommendations|Best for/gi) ? 1 : 0),
    };
    if (typeof drawBars === 'function') drawBars(counts);

    // Save to recent list
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await sbSave({
      id: newId(),
      when: new Date().toISOString(),
      kind: 'survey',
      source: 'compare',
      title: 'Literature Survey',
      url: activeTab?.url,
      text: survey
    });
    await refreshCompareList();

    // Offer a download
    await exportMarkdown('literature-survey.md', survey);

  } catch (err) {
    cmpOut.textContent = 'Survey generation failed: ' + (err?.message || String(err));
  }
});


  // =========================
  // Settings (optional preview actions)
  // =========================
  document.getElementById('cloudSync')?.addEventListener('change', (e)=>{
    alert(e.target.checked ? 'Cloud sync enabled (preview)' : 'Cloud sync disabled');
  });

  document.getElementById('btnClear')?.addEventListener('click', async ()=>{
    await chrome.storage.local.set({ [SB_KEY]: [] });
    cardList && (cardList.innerHTML = '');
    sumOut  && (sumOut.textContent = '');
    structOut && (structOut.textContent = '');
    cmpOut && (cmpOut.textContent = '');
    await refreshCompareList();
    alert('Local data cleared.');
  });

  // Initial populate for Compare
  refreshCompareList();
});
