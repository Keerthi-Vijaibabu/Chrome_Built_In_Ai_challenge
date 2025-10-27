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
  btnEnable.addEventListener('click', async () => {
    try {
      if (typeof Summarizer === 'undefined') {
        sumOut.textContent = 'Summarizer API not available in this Chrome.';
        return;
      }
      const avail = await Summarizer.availability(); // 'downloadable' | 'downloading' | 'ready' | 'unavailable'
      if (avail === 'unavailable') {
        sumOut.textContent = 'On-device model not supported on this device.';
        return;
      }
      const summarizer = await Summarizer.create({
        type: 'key-points',
        format: 'markdown',
        length: 'medium',
        monitor(m) {
          m.addEventListener('downloadprogress', e => {
            sumOut.textContent = `Downloading model… ${e.loaded ?? 0}`;
          });
        }
      });
      await summarizer.summarize('Ready check.');
      sumOut.textContent = 'On-device summarizer is ready.';
      btnEnable.textContent = 'Ready ✓';
      btnEnable.disabled = true;
      chrome.storage.local.set({ sb_ready: true });
    } catch (e) {
      sumOut.textContent = 'Prep error: ' + (e?.message || String(e));
    }
  });

  // ------- Summarize (preview behavior for now) -------
  btnSummarize.addEventListener('click', () => {
    const txt = (sumText.value || '').trim()
      || 'Neural networks learn patterns by adjusting weights to minimize loss.';
    sumOut.textContent =
      '• Key idea: ' + txt.slice(0, 80) +
      '\n• Why it matters: concise notes accelerate review' +
      '\n• Tip: Turn this into 1–2 flashcards';
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
