// src/pdfjs-setup.js
(() => {
  if (!window.pdfjsLib) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.js");
})();
