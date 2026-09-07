"use strict";

/* ---------- Utils: byte <-> format conversion ---------- */

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" ");
}
function bytesToDec(bytes) {
  return Array.from(bytes).join(", ");
}
function bytesToBinary(bytes) {
  return Array.from(bytes).map(b => b.toString(2).padStart(8, "0")).join(" ");
}
function bytesToBase64(bytes) {
  let bin = "";
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function bytesToUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch (e) {
    return "(kunde inte avkoda som UTF-8)";
  }
}

function dataViewToBytes(dataView) {
  return new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
}

/* ---------- NDEF record decoding ---------- */

function decodeTextRecord(record, bytes) {
  // record.encoding ("utf-8" | "utf-16"), record.lang available directly on NDEFRecord
  const encoding = record.encoding || "utf-8";
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch (e) {
    return bytesToUtf8(bytes);
  }
}

function describeRecord(record) {
  const bytes = record.data ? dataViewToBytes(record.data) : new Uint8Array();
  const info = {
    recordType: record.recordType,
    mediaType: record.mediaType || null,
    id: record.id || null,
    lang: record.lang || null,
    encoding: record.encoding || null,
    byteLength: bytes.length,
    bytes,
  };
  return info;
}

function formatBytes(bytes, format) {
  switch (format) {
    case "hex": return bytesToHex(bytes);
    case "dec": return bytesToDec(bytes);
    case "binary": return bytesToBinary(bytes);
    case "base64": return bytesToBase64(bytes);
    case "utf8": return bytesToUtf8(bytes);
    default: return bytesToHex(bytes);
  }
}

function formatRecord(record, format) {
  const info = describeRecord(record);

  if (format === "json") {
    const decodedGuess =
      info.recordType === "text" ? decodeTextRecord(record, info.bytes) :
      (info.recordType === "url" || info.recordType === "absolute-url") ? bytesToUtf8(info.bytes) :
      null;
    return JSON.stringify({
      recordType: info.recordType,
      mediaType: info.mediaType,
      id: info.id,
      lang: info.lang,
      encoding: info.encoding,
      byteLength: info.byteLength,
      hex: bytesToHex(info.bytes),
      decodedText: decodedGuess,
    }, null, 2);
  }

  if (format === "auto") {
    if (info.recordType === "text") return decodeTextRecord(record, info.bytes);
    if (info.recordType === "url" || info.recordType === "absolute-url") return bytesToUtf8(info.bytes);
    return bytesToHex(info.bytes);
  }

  if (format === "utf8") return bytesToUtf8(info.bytes);

  return formatBytes(info.bytes, format);
}

/* ---------- State ---------- */

const state = {
  tab: "read",
  scanning: false,
  history: loadHistory(),
};

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem("nfc-history") || "[]");
  } catch (e) {
    return [];
  }
}
function saveHistory() {
  try {
    localStorage.setItem("nfc-history", JSON.stringify(state.history.slice(0, 300)));
  } catch (e) { /* storage full or unavailable - ignore */ }
}

/* ---------- Toast ---------- */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------- Tabs ---------- */

document.querySelectorAll("nav.tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.tab).classList.add("active");
    state.tab = btn.dataset.tab;
    if (btn.dataset.tab === "history") renderHistory();
  });
});

/* ---------- Read / Scan ---------- */

const scanBtn = document.getElementById("scan-btn");
const scanDot = document.getElementById("scan-dot");
const scanStatus = document.getElementById("scan-status");
const resultCard = document.getElementById("result-card");
const resultRecords = document.getElementById("result-records");
const resultBadge = document.getElementById("result-badge");
const fmtSelect = document.getElementById("fmt-select");
const recFilter = document.getElementById("rec-filter");

let lastEvent = null;
let ndefReader = null;
let scanController = null;

// Barcode-tab elements
const barcodeScanBtn = document.getElementById("barcode-scan-btn");
const barcodeScanDot = document.getElementById("barcode-scan-dot");
const barcodeScanStatus = document.getElementById("barcode-scan-status");
const barcodeCodeEl = document.getElementById("barcode-code");
const barcodeCodeMeta = document.getElementById("barcode-code-meta");
const barcodeCopyBtn = document.getElementById("barcode-copy-btn");
const barcodeRecent = document.getElementById("barcode-recent");
const bcSource = document.getElementById("bc-source");
const bcRecordIndex = document.getElementById("bc-record-index");
const bcDigitsOnly = document.getElementById("bc-digits-only");
const bcSkip = document.getElementById("bc-skip");
const bcLength = document.getElementById("bc-length");

let lastBarcode = "";
let recentCodes = [];

function setScanStatus(text, cls) {
  scanStatus.textContent = text;
  scanDot.className = "dot" + (cls ? " " + cls : "");
  barcodeScanStatus.textContent = text;
  barcodeScanDot.className = "dot" + (cls ? " " + cls : "");
}

function setScanButtons(scanning) {
  const label = scanning ? "Stoppa skanning" : "Starta skanning";
  const barcodeLabel = scanning ? "Stoppa skanning" : "Starta kontinuerlig skanning";
  scanBtn.textContent = label;
  barcodeScanBtn.textContent = barcodeLabel;
}

/* ---------- Barcode extraction ---------- */

function readIntSetting(el, fallback) {
  const v = parseInt(el.value, 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function extractBarcode(event) {
  const records = Array.from(event.message.records);
  const idx = readIntSetting(bcRecordIndex, 0);
  const record = records[idx] || records[0];
  if (!record) return { code: "", raw: "", note: "Ingen NDEF-post hittades på taggen." };

  const source = bcSource.value;
  let raw = formatRecord(record, source === "auto" ? "auto" : source === "hex" ? "hex" : "utf8");
  // For extraction we want an unspaced string to slice cleanly; hex format from formatRecord has spaces.
  if (source === "hex" || (source === "auto" && record.recordType !== "text" && record.recordType !== "url" && record.recordType !== "absolute-url")) {
    raw = bytesToHex(describeRecord(record).bytes).replace(/\s+/g, "");
  }

  let working = raw;
  if (bcDigitsOnly.checked) {
    working = working.replace(/\D+/g, "");
  }

  const skip = readIntSetting(bcSkip, 0);
  const length = readIntSetting(bcLength, 11);
  const code = working.slice(skip, skip + length);

  let note = `Post #${idx + 1} (${record.recordType}) · ${working.length} tecken tillgängliga efter filter`;
  if (code.length < length) {
    note += ` · endast ${code.length} av ${length} begärda tecken hittades`;
  }

  return { code, raw, note };
}

async function renderBarcodeResult(event) {
  const { code, note } = extractBarcode(event);
  lastBarcode = code;
  barcodeCodeEl.textContent = code || "—";
  barcodeCodeMeta.textContent = note;

  recentCodes.unshift({ code, time: new Date().toISOString(), serial: event.serialNumber || "" });
  recentCodes = recentCodes.slice(0, 10);
  renderRecentCodes();

  if (code) {
    try {
      await navigator.clipboard.writeText(code);
      toast(`Kopierat: ${code}`);
    } catch (e) {
      toast(`Skannat: ${code} (tryck Kopiera)`);
    }
  } else {
    toast("Kunde inte extrahera någon kod ur taggen");
  }
}

function renderRecentCodes() {
  if (recentCodes.length === 0) {
    barcodeRecent.innerHTML = '<div class="empty">Inga skanningar än.</div>';
    return;
  }
  barcodeRecent.innerHTML = "";
  recentCodes.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "recent-item";
    const left = document.createElement("div");
    left.innerHTML = `${entry.code || "(tom)"}<span class="rt">${new Date(entry.time).toLocaleTimeString("sv-SE")}</span>`;
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.textContent = "Kopiera";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(entry.code);
        toast("Kopierat: " + entry.code);
      } catch (e) {
        toast("Kunde inte kopiera");
      }
    });
    div.appendChild(left);
    div.appendChild(btn);
    barcodeRecent.appendChild(div);
  });
}

barcodeCopyBtn.addEventListener("click", async () => {
  if (!lastBarcode) { toast("Ingen kod att kopiera än"); return; }
  try {
    await navigator.clipboard.writeText(lastBarcode);
    toast("Kopierat: " + lastBarcode);
  } catch (e) {
    toast("Kunde inte kopiera automatiskt");
  }
});

[bcSource, bcRecordIndex, bcDigitsOnly, bcSkip, bcLength].forEach((el) => {
  el.addEventListener("change", () => {
    persistBarcodeSettings();
    if (lastEvent) renderBarcodeResult(lastEvent);
  });
});

function persistBarcodeSettings() {
  try {
    localStorage.setItem("nfc-barcode-settings", JSON.stringify({
      source: bcSource.value,
      recordIndex: bcRecordIndex.value,
      digitsOnly: bcDigitsOnly.checked,
      skip: bcSkip.value,
      length: bcLength.value,
    }));
  } catch (e) {}
}
(function restoreBarcodeSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("nfc-barcode-settings") || "null");
    if (!s) return;
    bcSource.value = s.source ?? "auto";
    bcRecordIndex.value = s.recordIndex ?? "0";
    bcDigitsOnly.checked = s.digitsOnly !== false;
    bcSkip.value = s.skip ?? "0";
    bcLength.value = s.length ?? "11";
  } catch (e) {}
})();

function matchesFilter(record, filter) {
  if (filter === "all") return true;
  if (filter === "text") return record.recordType === "text";
  if (filter === "url") return record.recordType === "url" || record.recordType === "absolute-url";
  if (filter === "mime") return record.recordType === "mime";
  return true;
}

function renderResult() {
  if (!lastEvent) return;
  const format = fmtSelect.value;
  const filter = recFilter.value;
  const records = Array.from(lastEvent.message.records).filter(r => matchesFilter(r, filter));

  resultBadge.textContent = lastEvent.serialNumber ? `Serienr: ${lastEvent.serialNumber}` : "Okänt serienr";
  resultRecords.innerHTML = "";

  if (records.length === 0) {
    resultRecords.innerHTML = '<div class="empty">Inga poster matchar filtret.</div>';
  } else {
    records.forEach((r, idx) => {
      const div = document.createElement("div");
      div.className = "record";
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<span>#${idx + 1} · ${r.recordType}${r.mediaType ? " (" + r.mediaType + ")" : ""}</span><span>${r.id ? "id: " + r.id : ""}</span>`;
      const pre = document.createElement("pre");
      pre.textContent = formatRecord(r, format);
      div.appendChild(meta);
      div.appendChild(pre);
      resultRecords.appendChild(div);
    });
  }

  resultCard.style.display = "block";
}

fmtSelect.addEventListener("change", () => { renderResult(); persistFormatChoice(); });
recFilter.addEventListener("change", renderResult);

function persistFormatChoice() {
  try { localStorage.setItem("nfc-format", fmtSelect.value); } catch (e) {}
}
(function restoreFormatChoice() {
  try {
    const v = localStorage.getItem("nfc-format");
    if (v) fmtSelect.value = v;
  } catch (e) {}
})();

function addToHistory(event) {
  const format = fmtSelect.value;
  const records = Array.from(event.message.records).map(r => {
    const info = describeRecord(r);
    return {
      recordType: info.recordType,
      mediaType: info.mediaType,
      id: info.id,
      hex: bytesToHex(info.bytes),
      formatted: formatRecord(r, format),
    };
  });
  state.history.unshift({
    timestamp: new Date().toISOString(),
    serialNumber: event.serialNumber || null,
    format,
    records,
  });
  saveHistory();
}

async function startScan() {
  if (!("NDEFReader" in window)) {
    setScanStatus("Web NFC stöds inte i den här webbläsaren.", "err");
    toast("Kräver Chrome på Android.");
    return;
  }
  try {
    scanController = new AbortController();
    ndefReader = new NDEFReader();
    await ndefReader.scan({ signal: scanController.signal });
    state.scanning = true;
    setScanStatus("Skannar... håll telefonen mot en tagg", "scanning");
    setScanButtons(true);

    ndefReader.onreading = (event) => {
      lastEvent = event;
      renderResult();
      addToHistory(event);
      renderBarcodeResult(event);
      setScanStatus("Tagg läst ✓ — redo för nästa", "ok");
    };
    ndefReader.onreadingerror = () => {
      setScanStatus("Kunde inte läsa taggen, försök igen.", "err");
    };

    scanController.signal.addEventListener("abort", () => {
      state.scanning = false;
      setScanStatus("Skanning stoppad", null);
      setScanButtons(false);
    });
  } catch (err) {
    state.scanning = false;
    setScanButtons(false);
    if (err.name === "NotAllowedError") {
      setScanStatus("NFC-behörighet nekad.", "err");
    } else if (err.name === "NotSupportedError") {
      setScanStatus("NFC stöds inte på den här enheten.", "err");
    } else if (err.name === "AbortError") {
      setScanStatus("Skanning stoppad", null);
    } else {
      setScanStatus("Fel: " + err.message, "err");
    }
  }
}

function stopScan() {
  if (scanController) scanController.abort();
}

function toggleScan() {
  if (state.scanning) stopScan();
  else startScan();
}

scanBtn.addEventListener("click", toggleScan);
barcodeScanBtn.addEventListener("click", toggleScan);

document.getElementById("copy-result-btn").addEventListener("click", async () => {
  if (!lastEvent) { toast("Inget att kopiera än"); return; }
  const format = fmtSelect.value;
  const filter = recFilter.value;
  const records = Array.from(lastEvent.message.records).filter(r => matchesFilter(r, filter));
  const text = records.map(r => formatRecord(r, format)).join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("Kopierat till urklipp");
  } catch (e) {
    toast("Kunde inte kopiera automatiskt");
  }
});

/* ---------- Write ---------- */

const writeBtn = document.getElementById("write-btn");
const writeDot = document.getElementById("write-dot");
const writeStatus = document.getElementById("write-status");
const writeType = document.getElementById("write-type");
const writeValue = document.getElementById("write-value");

function setWriteStatus(text, cls) {
  writeStatus.textContent = text;
  writeDot.className = "dot" + (cls ? " " + cls : "");
}

writeBtn.addEventListener("click", async () => {
  if (!("NDEFReader" in window)) {
    setWriteStatus("Web NFC stöds inte i den här webbläsaren.", "err");
    return;
  }
  const value = writeValue.value.trim();
  if (!value) {
    toast("Skriv in något innehåll först");
    return;
  }
  const type = writeType.value;
  try {
    const writer = new NDEFReader();
    setWriteStatus("Håll telefonen mot taggen...", "scanning");
    const record = type === "url"
      ? { recordType: "url", data: value }
      : { recordType: "text", data: value };
    await writer.write({ records: [record] });
    setWriteStatus("Skrivet till tagg ✓", "ok");
    toast("Tagg skriven");
  } catch (err) {
    if (err.name === "NotAllowedError") {
      setWriteStatus("NFC-behörighet nekad.", "err");
    } else {
      setWriteStatus("Fel: " + err.message, "err");
    }
  }
});

/* ---------- History ---------- */

const historyList = document.getElementById("history-list");

function renderHistory() {
  if (state.history.length === 0) {
    historyList.innerHTML = '<div class="empty">Inga sparade skanningar än.</div>';
    return;
  }
  historyList.innerHTML = "";
  state.history.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "scan-entry";
    const dt = new Date(entry.timestamp);
    const top = document.createElement("div");
    top.className = "top";
    top.innerHTML = `<span>${dt.toLocaleString("sv-SE")}</span><span>${entry.serialNumber || ""}</span>`;
    div.appendChild(top);
    entry.records.forEach((r, idx) => {
      const pre = document.createElement("pre");
      pre.style.margin = "4px 0";
      pre.style.whiteSpace = "pre-wrap";
      pre.style.wordBreak = "break-all";
      pre.style.fontSize = "12px";
      pre.textContent = `#${idx + 1} (${r.recordType}) ${r.formatted}`;
      div.appendChild(pre);
    });
    historyList.appendChild(div);
  });
}

document.getElementById("clear-history-btn").addEventListener("click", () => {
  if (!confirm("Rensa all sparad historik?")) return;
  state.history = [];
  saveHistory();
  renderHistory();
  toast("Historik rensad");
});

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

document.getElementById("export-json-btn").addEventListener("click", () => {
  if (state.history.length === 0) { toast("Ingen historik att exportera"); return; }
  downloadFile("nfc-historik.json", JSON.stringify(state.history, null, 2), "application/json");
});

document.getElementById("export-csv-btn").addEventListener("click", () => {
  if (state.history.length === 0) { toast("Ingen historik att exportera"); return; }
  const rows = [["timestamp", "serialNumber", "recordIndex", "recordType", "mediaType", "hex", "formatted"]];
  state.history.forEach(entry => {
    entry.records.forEach((r, idx) => {
      rows.push([
        entry.timestamp,
        entry.serialNumber || "",
        idx + 1,
        r.recordType,
        r.mediaType || "",
        r.hex,
        (r.formatted || "").replace(/\n/g, " ").replace(/"/g, '""'),
      ]);
    });
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile("nfc-historik.csv", csv, "text/csv");
});

/* ---------- Service worker registration ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

renderHistory();
