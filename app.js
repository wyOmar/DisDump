// --- State & Configuration ---
const VPS_BASE_URL = "";
const ITEMS_PER_PAGE = 100;

// Automatic Localhost Detection
const IS_LOCAL_HOST = ["localhost", "127.0.0.1", "", "::1"].includes(window.location.hostname);

const JUNK_TAGS = new Set([
  "none", "unknown", "n/a", "null", "undefined", "other", 
  "image", "photo", "screenshot", "real life photo"
]);

const PROMPT_BLEED_PATTERNS = [
  /or category/i,
  /\(e\.g\..*?\)/i,
  /e\.g\./i,
  /specific video game/i,
  /video game title/i,
  /minecraft, valorant/i,
  /discord chat, code/i
];

let sqlEngine = null;
let activeDb = null;
let hasIndexedDbLoaded = false;
let currentExportDirHandle = null;
let isExtractionRunning = false;
let isCloudScanningRunning = false;
let activeCloudJobId = null;
let hasShownLabelDemoModal = false;

let allMediaRegistry = [];       // Master user archive items
let demoMediaRegistry = [];      // Isolated 26 demo items for AI search
let rawFilteredRegistry = [];    // Tab 2 items
let aiFilteredRegistry = [];     // Tab 3 items

// High-Performance Incremental Category Counters
let rawCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };
let aiCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };

// Multi-select Category Filters: Defaults to Images & Videos
let rawSelectedCategories = new Set(["image", "video"]);
let aiSelectedCategories = new Set(["image", "video"]);

// Sort Orders (Default: Newest to Oldest)
let rawSortOrder = "newest";
let aiSortOrder = "newest";

let rawCurrentPage = 1;
let aiCurrentPage = 1;
let aiSearchQuery = "";

// Timeline Bounds & Date Filters
let timelineMinDate = "2018-01-01";
let timelineMaxDate = "2026-12-31";
let rawFilterStartDate = null;
let rawFilterEndDate = null;

let aiTimelineMinDate = "2018-01-01";
let aiTimelineMaxDate = "2026-12-31";
let aiFilterStartDate = null;
let aiFilterEndDate = null;

// Lightbox Active State & Zero-Cost Pan/Zoom State
let currentLightboxList = [];
let currentLightboxIndex = -1;
let currentLightboxShowTags = false;

let zoomScale = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;

const folderHandleCache = new Map();

// UI References
const navTabs = document.querySelectorAll(".nav-tab");
const screenViews = document.querySelectorAll(".screen-view");
const navBrand = document.getElementById("navBrand");
const btnHeroOpenExisting = document.getElementById("btnHeroOpenExisting");
const btnRawOpenFolder = document.getElementById("btnRawOpenFolder");
const btnAiOpenFolder = document.getElementById("btnAiOpenFolder");
const btnEmptyOpenFolder = document.getElementById("btnEmptyOpenFolder");

// Tab 1: Extractor Elements
const extractorZipInput = document.getElementById("extractorZipInput");
const lblChooseZip = document.getElementById("lblChooseZip");
const selectedZipFilename = document.getElementById("selectedZipFilename");
const btnStartExportPipeline = document.getElementById("btnStartExportPipeline");

// Tab 2: Raw Browser Elements
const rawBrowserToolbar = document.getElementById("rawBrowserToolbar");
const rawCategoryFilterGroup = document.getElementById("rawCategoryFilterGroup");
const rawSortOrderSelect = document.getElementById("rawSortOrder");
const btnToggleRawDates = document.getElementById("btnToggleRawDates");
const rawTimelineCard = document.getElementById("rawTimelineCard");
const rawSliderBox = document.getElementById("rawSliderBox");
const rawSliderHighlight = document.getElementById("rawSliderHighlight");
const rawTimelineSliderFrom = document.getElementById("rawTimelineSliderFrom");
const rawTimelineSliderTo = document.getElementById("rawTimelineSliderTo");
const rawTimelineRangeLabel = document.getElementById("rawTimelineRangeLabel");
const rawDateFromInput = document.getElementById("rawDateFromInput");
const rawDateToInput = document.getElementById("rawDateToInput");
const btnResetRawDates = document.getElementById("btnResetRawDates");

const rawGrid = document.getElementById("rawGrid");
const rawEmptyState = document.getElementById("rawEmptyState");
const rawEmptyMessage = document.getElementById("rawEmptyMessage");
const rawEmptyCtaGroup = document.getElementById("rawEmptyCtaGroup");

const rawTopPagination = document.getElementById("rawTopPagination");
const rawBottomPagination = document.getElementById("rawBottomPagination");
const rawPageRangeTextTop = document.getElementById("rawPageRangeTextTop");
const rawPageRangeTextBottom = document.getElementById("rawPageRangeTextBottom");
const rawPageJumpTop = document.getElementById("rawPageJumpTop");
const rawPageJumpBottom = document.getElementById("rawPageJumpBottom");
const rawPageTotalTop = document.getElementById("rawPageTotalTop");
const rawPageTotalBottom = document.getElementById("rawPageTotalBottom");
const btnRawPrevPageTop = document.getElementById("btnRawPrevPageTop");
const btnRawPrevPageBottom = document.getElementById("btnRawPrevPageBottom");
const btnRawNextPageTop = document.getElementById("btnRawNextPageTop");
const btnRawNextPageBottom = document.getElementById("btnRawNextPageBottom");

// Tab 3: AI Search Elements
const cloudScannerCard = document.getElementById("cloudScannerCard");
const localHostBanner = document.getElementById("localHostBanner");
const cloudZipInput = document.getElementById("cloudZipInput");
const lblCloudZip = document.getElementById("lblCloudZip");
const btnStartCloudScan = document.getElementById("btnStartCloudScan");
const aiSearchInput = document.getElementById("aiSearchInput");
const btnClearAiSearch = document.getElementById("btnClearAiSearch");
const aiIndexStatus = document.getElementById("aiIndexStatus");
const aiCategoryFilterGroup = document.getElementById("aiCategoryFilterGroup");
const aiSortOrderSelect = document.getElementById("aiSortOrder");
const btnToggleAiDates = document.getElementById("btnToggleAiDates");

const aiTimelineCard = document.getElementById("aiTimelineCard");
const aiSliderBox = document.getElementById("aiSliderBox");
const aiSliderHighlight = document.getElementById("aiSliderHighlight");
const aiTimelineSliderFrom = document.getElementById("aiTimelineSliderFrom");
const aiTimelineSliderTo = document.getElementById("aiTimelineSliderTo");
const aiTimelineRangeLabel = document.getElementById("aiTimelineRangeLabel");
const aiDateFromInput = document.getElementById("aiDateFromInput");
const aiDateToInput = document.getElementById("aiDateToInput");
const btnResetAiDates = document.getElementById("btnResetAiDates");

const aiGrid = document.getElementById("aiGrid");
const aiEmptyState = document.getElementById("aiEmptyState");
const aiEmptyMessage = document.getElementById("aiEmptyMessage");

const aiPageRangeTextTop = document.getElementById("aiPageRangeTextTop");
const aiPageRangeTextBottom = document.getElementById("aiPageRangeTextBottom");
const aiPageJumpTop = document.getElementById("aiPageJumpTop");
const aiPageJumpBottom = document.getElementById("aiPageJumpBottom");
const aiPageTotalTop = document.getElementById("aiPageTotalTop");
const aiPageTotalBottom = document.getElementById("aiPageTotalBottom");
const btnAiPrevPageTop = document.getElementById("btnAiPrevPageTop");
const btnAiPrevPageBottom = document.getElementById("btnAiPrevPageBottom");
const btnAiNextPageTop = document.getElementById("btnAiNextPageTop");
const btnAiNextPageBottom = document.getElementById("btnAiNextPageBottom");

// Support / Info Modal Elements
const supportModal = document.getElementById("supportModal");
const modalTag = document.getElementById("modalTag");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const btnOpenSupportModal = document.getElementById("btnOpenSupportModal");
const btnOpenLocalDemoInfo = document.getElementById("btnOpenLocalDemoInfo");
const btnCloseSupportModal = document.getElementById("btnCloseSupportModal");

// Browser Compatibility Modal Elements
const browserWarningModal = document.getElementById("browserWarningModal");
const btnCloseBrowserWarning = document.getElementById("btnCloseBrowserWarning");
const btnAcknowledgeBrowserWarning = document.getElementById("btnAcknowledgeBrowserWarning");

// Sticky Downloader Bar
const downloadStatusBar = document.getElementById("downloadStatusBar");
const dlStatusTitle = document.getElementById("dlStatusTitle");
const dlStatusDetail = document.getElementById("dlStatusDetail");
const dlProgressBar = document.getElementById("dlProgressBar");
const btnViewLive = document.getElementById("btnViewLive");

// Lightbox Elements
const lightbox = document.getElementById("lightbox");
const btnCloseLightbox = document.getElementById("btnCloseLightbox");
const btnLightboxPrev = document.getElementById("btnLightboxPrev");
const btnLightboxNext = document.getElementById("btnLightboxNext");
const lightboxMediaPane = document.getElementById("lightboxMediaPane");
const mediaContainer = document.getElementById("mediaContainer");
const lightboxFilename = document.getElementById("lightboxFilename");
const lightboxTimestamp = document.getElementById("lightboxTimestamp");
const lightboxSubfolder = document.getElementById("lightboxSubfolder");
const paneVisualTagsSection = document.getElementById("paneVisualTagsSection");
const paneOcrTextSection = document.getElementById("paneOcrTextSection");
const lightboxVisualTags = document.getElementById("lightboxVisualTags");
const lightboxOcrText = document.getElementById("lightboxOcrText");

let selectedZipFile = null;
let selectedCloudZip = null;

// --- 1. Mode Initialization & Browser Compatibility Check ---
function setupEnvironmentMode() {
  if (IS_LOCAL_HOST) {
    if (cloudScannerCard) cloudScannerCard.remove();
    if (localHostBanner) localHostBanner.classList.remove("hidden");
  } else {
    if (localHostBanner) localHostBanner.remove();
  }

  if (typeof window.showDirectoryPicker !== "function") {
    if (browserWarningModal) {
      browserWarningModal.classList.remove("hidden");
    }
  }
}

if (btnCloseBrowserWarning) {
  btnCloseBrowserWarning.addEventListener("click", () => browserWarningModal.classList.add("hidden"));
}
if (btnAcknowledgeBrowserWarning) {
  btnAcknowledgeBrowserWarning.addEventListener("click", () => browserWarningModal.classList.add("hidden"));
}

window.addEventListener("beforeunload", (e) => {
  if (isExtractionRunning || isCloudScanningRunning) {
    e.preventDefault();
    e.returnValue = "Processing is currently in progress. Leaving this page will abort extraction or remove you from the cloud queue.";
    return e.returnValue;
  }
});

window.addEventListener("pagehide", () => {
  if (activeCloudJobId && isCloudScanningRunning) {
    fetch(`${VPS_BASE_URL}/api/cancel-job/${activeCloudJobId}`, {
      method: "POST",
      keepalive: true
    }).catch(() => {});
  }
});

// --- 2. Tab Navigation & Modal Dismissal ---
function switchTab(targetId) {
  if (supportModal) supportModal.classList.add("hidden");
  if (browserWarningModal) browserWarningModal.classList.add("hidden");

  navTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === targetId));
  screenViews.forEach(v => v.classList.toggle("active", v.id === targetId));

  if (targetId === "tabRawBrowser") {
    applyRawFiltersAndPaginate();
  }

  if (targetId === "tabAiSearch") {
    applyAiFiltersAndPaginate();
    if (!hasShownLabelDemoModal) {
      openDemoInfoModal();
      hasShownLabelDemoModal = true;
    }
  }
}

navTabs.forEach(tab => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});
navBrand.addEventListener("click", () => switchTab("tabExtractor"));
btnViewLive.addEventListener("click", () => switchTab("tabRawBrowser"));

// --- 3. Utilities & Fast Normalization ---
function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num || 0);
}

function getCategory(ext) {
  const images = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"];
  const videos = ["mp4", "webm", "mov", "mkv", "avi"];
  const audios = ["mp3", "wav", "ogg", "m4a", "flac"];
  const docs = ["pdf", "txt", "docx", "xlsx", "json", "csv", "cfg", "lua", "py", "java", "html", "css"];

  if (images.includes(ext)) return "image";
  if (videos.includes(ext)) return "video";
  if (audios.includes(ext)) return "audio";
  if (docs.includes(ext)) return "doc";
  return "other";
}

function normalizeDiscordUrl(url) {
  if (!url) return "";
  let clean = url.replace(/[)\]">]+$/, "");
  if (clean.includes("media.discordapp.net")) {
    clean = clean.replace("media.discordapp.net", "cdn.discordapp.com");
  }
  if (clean.includes("?width=") || clean.includes("&width=")) {
    try {
      const parsed = new URL(clean);
      parsed.searchParams.delete("width");
      parsed.searchParams.delete("height");
      parsed.searchParams.delete("format");
      return parsed.toString();
    } catch {
      return clean;
    }
  }
  return clean;
}

function extractDateFromFilename(filename) {
  if (!filename) return "Unknown";
  
  const isoMatch = filename.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [_, y, m, d, hh, mm, ss] = isoMatch;
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  const compactMatch = filename.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (compactMatch) {
    const [_, y, m, d, hh, mm, ss] = compactMatch;
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  const dateOnlyMatch = filename.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
  if (dateOnlyMatch) {
    const [_, y, m, d] = dateOnlyMatch;
    return `${y}-${m}-${d} 00:00:00`;
  }

  return "Unknown";
}

function formatDatePrefix(timestampStr) {
  if (!timestampStr) return "2023-01-01_00-00-00";
  try {
    const d = new Date(timestampStr);
    if (isNaN(d.getTime())) return "2023-01-01_00-00-00";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  } catch {
    return "2023-01-01_00-00-00";
  }
}

async function initSql() {
  if (!sqlEngine) {
    sqlEngine = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
    });
  }
}

async function getSubfolder(rootDirHandle, ext) {
  const name = ext.toLowerCase();
  if (!folderHandleCache.has(name)) {
    const handle = await rootDirHandle.getDirectoryHandle(name, { create: true });
    folderHandleCache.set(name, handle);
  }
  return folderHandleCache.get(name);
}

function getSanitizedTagsList(tagsString) {
  if (!tagsString) return [];
  return tagsString
    .split(",")
    .map(t => t.trim().replace(/^[{}\[\]"\'`()]+|[{}\[\]"\'`()]+$/g, ""))
    .filter(t => {
      if (!t || JUNK_TAGS.has(t.toLowerCase()) || t.length > 40) return false;
      return !PROMPT_BLEED_PATTERNS.some(rx => rx.test(t));
    });
}

async function resolveItemBlob(item) {
  if (item.blobUrl) return item.blobUrl;
  if (item.fileHandle) {
    try {
      const f = await item.fileHandle.getFile();
      item.blobUrl = URL.createObjectURL(f);
      return item.blobUrl;
    } catch (e) {
      console.warn(`Could not resolve blob for ${item.filename}:`, e);
    }
  }
  if (item.url) {
    return item.url;
  }
  return null;
}

// --- 4. Load Pre-Indexed Demo ---
async function loadDemoVault() {
  try {
    await initSql();
    const dbResp = await fetch("demo/screenshots.db");
    if (!dbResp.ok) throw new Error("demo/screenshots.db not found");
    const dbBuf = await dbResp.arrayBuffer();

    activeDb = new sqlEngine.Database(new Uint8Array(dbBuf));
    const res = activeDb.exec("SELECT image_filename, ocr_text, visual_tags FROM screenshot_search");

    if (res.length > 0) {
      demoMediaRegistry = [];
      aiCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };

      for (const [filename, ocrText, visualTags] of res[0].values) {
        const ext = filename.split(".").pop().toLowerCase();
        const folder = (ext === "png") ? "png" : "jpg";
        const cat = getCategory(ext);
        aiCategoryCounts[cat] = (aiCategoryCounts[cat] || 0) + 1;

        demoMediaRegistry.push({
          id: demoMediaRegistry.length,
          filename: filename,
          ext: ext,
          category: cat,
          timestamp: extractDateFromFilename(filename),
          blobUrl: `demo/${folder}/${filename}`,
          fileHandle: null,
          url: null,
          ocrText: ocrText || "",
          visualTags: visualTags || ""
        });
      }

      updateAiTimelineBounds();
      renderBadgeUI();
      aiIndexStatus.textContent = `Pre-Loaded Demo Index (${demoMediaRegistry.length} items ready)`;
    }
  } catch (err) {
    aiIndexStatus.textContent = "No database loaded. Open an export folder or run GPU scan.";
  }
}

function renderBadgeUI() {
  document.getElementById("rawCntImg").textContent = formatNumber(rawCategoryCounts.image);
  document.getElementById("rawCntVid").textContent = formatNumber(rawCategoryCounts.video);
  document.getElementById("rawCntAud").textContent = formatNumber(rawCategoryCounts.audio);
  document.getElementById("rawCntDoc").textContent = formatNumber(rawCategoryCounts.doc);
  document.getElementById("rawCntOth").textContent = formatNumber(rawCategoryCounts.other);

  const activeAiCounts = hasIndexedDbLoaded ? rawCategoryCounts : aiCategoryCounts;
  document.getElementById("aiCntImg").textContent = formatNumber(activeAiCounts.image);
  document.getElementById("aiCntVid").textContent = formatNumber(activeAiCounts.video);
  document.getElementById("aiCntAud").textContent = formatNumber(activeAiCounts.audio);
  document.getElementById("aiCntDoc").textContent = formatNumber(activeAiCounts.doc);
  document.getElementById("aiCntOth").textContent = formatNumber(activeAiCounts.other);
}

// --- 5. TAB 2: Raw Media Browser Logic & Timeline Engine ---
function updateTimelineBounds() {
  if (!allMediaRegistry.length) return;
  const timestamps = allMediaRegistry
    .map(m => m.timestamp)
    .filter(t => t && t.length >= 10 && t !== "Unknown" && t !== "Demo Archive" && t !== "Local Archive")
    .sort();

  if (timestamps.length) {
    timelineMinDate = timestamps[0].slice(0, 10);
    timelineMaxDate = timestamps[timestamps.length - 1].slice(0, 10);
    rawDateFromInput.min = timelineMinDate;
    rawDateFromInput.max = timelineMaxDate;
    rawDateToInput.min = timelineMinDate;
    rawDateToInput.max = timelineMaxDate;
    rawDateFromInput.value = timelineMinDate;
    rawDateToInput.value = timelineMaxDate;
    rawTimelineRangeLabel.textContent = `${timelineMinDate} ➔ ${timelineMaxDate}`;
    updateSliderHighlightBar(rawSliderHighlight, 0, 100);
  }
}

function updateAiTimelineBounds() {
  const source = hasIndexedDbLoaded 
    ? allMediaRegistry.filter(item => item.visualTags || item.ocrText) 
    : demoMediaRegistry;
  if (!source.length) return;
  const timestamps = source
    .map(m => m.timestamp)
    .filter(t => t && t.length >= 10 && t !== "Unknown")
    .sort();

  if (timestamps.length) {
    aiTimelineMinDate = timestamps[0].slice(0, 10);
    aiTimelineMaxDate = timestamps[timestamps.length - 1].slice(0, 10);
    aiDateFromInput.min = aiTimelineMinDate;
    aiDateFromInput.max = aiTimelineMaxDate;
    aiDateToInput.min = aiTimelineMinDate;
    aiDateToInput.max = aiTimelineMaxDate;
    aiDateFromInput.value = aiTimelineMinDate;
    aiDateToInput.value = aiTimelineMaxDate;
    aiTimelineRangeLabel.textContent = `${aiTimelineMinDate} ➔ ${aiTimelineMaxDate}`;
    updateSliderHighlightBar(aiSliderHighlight, 0, 100);
  }
}

function applyRawFiltersAndPaginate() {
  if (allMediaRegistry.length === 0) {
    rawBrowserToolbar.classList.add("hidden");
    rawTimelineCard.classList.add("hidden");
    rawTopPagination.classList.add("hidden");
    rawBottomPagination.classList.add("hidden");
    renderRawGrid([]);
    return;
  }

  rawBrowserToolbar.classList.remove("hidden");
  rawTopPagination.classList.remove("hidden");
  rawBottomPagination.classList.remove("hidden");

  rawFilteredRegistry = allMediaRegistry.filter(item => {
    if (!rawSelectedCategories.has(item.category)) return false;
    if (rawFilterStartDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) < rawFilterStartDate) return false;
    if (rawFilterEndDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) > rawFilterEndDate) return false;
    return true;
  });

  if (rawSortOrder === "newest") {
    rawFilteredRegistry.sort((a, b) => b.filename.localeCompare(a.filename));
  } else {
    rawFilteredRegistry.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  const total = rawFilteredRegistry.length;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;

  if (rawCurrentPage > totalPages) rawCurrentPage = totalPages;
  if (rawCurrentPage < 1) rawCurrentPage = 1;

  rawPageJumpTop.value = rawCurrentPage;
  rawPageJumpBottom.value = rawCurrentPage;
  rawPageJumpTop.max = totalPages;
  rawPageJumpBottom.max = totalPages;
  rawPageTotalTop.textContent = `/ ${formatNumber(totalPages)}`;
  rawPageTotalBottom.textContent = `/ ${formatNumber(totalPages)}`;

  const isPrevDisabled = rawCurrentPage <= 1;
  const isNextDisabled = rawCurrentPage >= totalPages;
  btnRawPrevPageTop.disabled = isPrevDisabled;
  btnRawPrevPageBottom.disabled = isPrevDisabled;
  btnRawNextPageTop.disabled = isNextDisabled;
  btnRawNextPageBottom.disabled = isNextDisabled;

  const startIdx = (rawCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, total);
  const rangeStr = total > 0 
    ? `Showing ${formatNumber(startIdx + 1)} - ${formatNumber(endIdx)} of ${formatNumber(total)}` 
    : "Showing 0 - 0 of 0";
  rawPageRangeTextTop.textContent = rangeStr;
  rawPageRangeTextBottom.textContent = rangeStr;

  renderRawGrid(rawFilteredRegistry.slice(startIdx, endIdx));
}

function renderRawGrid(items) {
  rawGrid.innerHTML = "";
  if (items.length === 0) {
    rawGrid.appendChild(rawEmptyState);
    if (allMediaRegistry.length > 0) {
      rawEmptyMessage.textContent = "No media files match your current category or date filters.";
      rawEmptyCtaGroup.classList.add("hidden");
    } else {
      rawEmptyMessage.textContent = "No media files loaded yet.";
      rawEmptyCtaGroup.classList.remove("hidden");
    }
    rawEmptyState.classList.remove("hidden");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const card = document.createElement("div");
    card.className = "media-item-card";

    let placeholderThumb = "";
    if (item.category === "image") placeholderThumb = `<div class="generic-file-icon">🖼️</div>`;
    else if (item.category === "video") placeholderThumb = `<div class="generic-file-icon">🎥</div>`;
    else if (item.category === "audio") placeholderThumb = `<div class="generic-file-icon">🎵</div>`;
    else if (item.category === "doc") placeholderThumb = `<div class="generic-file-icon">📄</div>`;
    else placeholderThumb = `<div class="generic-file-icon">📦</div>`;

    card.innerHTML = `
      <div class="media-thumb">${placeholderThumb}</div>
      <div class="card-info">
        <div class="card-title-text" title="${item.filename}">${item.filename}</div>
        <div class="card-date-text">${item.timestamp}</div>
      </div>
    `;

    const thumbContainer = card.querySelector(".media-thumb");
    if (item.category === "image" || item.category === "video") {
      resolveItemBlob(item).then(url => {
        if (url && thumbContainer) {
          if (item.category === "image") {
            thumbContainer.innerHTML = `<img src="${url}" alt="${item.filename}" loading="lazy" decoding="async" />`;
          } else {
            thumbContainer.innerHTML = `<video src="${url}" muted preload="metadata"></video>`;
          }
        }
      });
    }

    card.addEventListener("click", () => {
      currentLightboxList = rawFilteredRegistry;
      currentLightboxIndex = (rawCurrentPage - 1) * ITEMS_PER_PAGE + i;
      openLightbox(item, false);
    });
    fragment.appendChild(card);
  }
  rawGrid.appendChild(fragment);
}

// Multi-Select Category Filters
rawCategoryFilterGroup.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  const filterCat = pill.dataset.filter;

  if (rawSelectedCategories.has(filterCat)) {
    rawSelectedCategories.delete(filterCat);
    pill.classList.remove("active");
  } else {
    rawSelectedCategories.add(filterCat);
    pill.classList.add("active");
  }

  rawCurrentPage = 1;
  applyRawFiltersAndPaginate();
});

// Sort Select Listener
rawSortOrderSelect.addEventListener("change", (e) => {
  rawSortOrder = e.target.value;
  rawCurrentPage = 1;
  applyRawFiltersAndPaginate();
});

// Toggle Collapsible Date Card
btnToggleRawDates.addEventListener("click", () => {
  rawTimelineCard.classList.toggle("hidden");
  btnToggleRawDates.classList.toggle("active", !rawTimelineCard.classList.contains("hidden"));
});

function updateSliderHighlightBar(highlightElement, fromVal, toVal) {
  highlightElement.style.left = `${fromVal}%`;
  highlightElement.style.width = `${toVal - fromVal}%`;
}

function updateTimelineDisplay(startVal, endVal) {
  const minTime = new Date(timelineMinDate).getTime();
  const maxTime = new Date(timelineMaxDate).getTime();
  
  const startTime = new Date(minTime + (maxTime - minTime) * (startVal / 100));
  const endTime = new Date(minTime + (maxTime - minTime) * (endVal / 100));
  
  rawFilterStartDate = startTime.toISOString().slice(0, 10);
  rawFilterEndDate = endTime.toISOString().slice(0, 10);
  
  rawDateFromInput.value = rawFilterStartDate;
  rawDateToInput.value = rawFilterEndDate;
  rawTimelineRangeLabel.textContent = `${rawFilterStartDate} ➔ ${rawFilterEndDate}`;
  updateSliderHighlightBar(rawSliderHighlight, startVal, endVal);
  
  rawCurrentPage = 1;
  applyRawFiltersAndPaginate();
}

rawTimelineSliderFrom.addEventListener("input", (e) => {
  let val = Math.min(Number(e.target.value), Number(rawTimelineSliderTo.value));
  e.target.value = val;
  updateTimelineDisplay(val, Number(rawTimelineSliderTo.value));
});

rawTimelineSliderTo.addEventListener("input", (e) => {
  let val = Math.max(Number(e.target.value), Number(rawTimelineSliderFrom.value));
  e.target.value = val;
  updateTimelineDisplay(Number(rawTimelineSliderFrom.value), val);
});

rawSliderBox.addEventListener("click", (e) => {
  if (e.target.classList.contains("dual-range-input")) return;
  const rect = rawSliderBox.getBoundingClientRect();
  const clickPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

  const distFrom = Math.abs(clickPercent - Number(rawTimelineSliderFrom.value));
  const distTo = Math.abs(clickPercent - Number(rawTimelineSliderTo.value));

  if (distFrom < distTo) {
    rawTimelineSliderFrom.value = Math.min(clickPercent, Number(rawTimelineSliderTo.value));
  } else {
    rawTimelineSliderTo.value = Math.max(clickPercent, Number(rawTimelineSliderFrom.value));
  }
  updateTimelineDisplay(Number(rawTimelineSliderFrom.value), Number(rawTimelineSliderTo.value));
});

rawDateFromInput.addEventListener("change", (e) => {
  rawFilterStartDate = e.target.value;
  rawTimelineRangeLabel.textContent = `${rawFilterStartDate || "Start"} ➔ ${rawFilterEndDate || "End"}`;
  rawCurrentPage = 1;
  applyRawFiltersAndPaginate();
});

rawDateToInput.addEventListener("change", (e) => {
  rawFilterEndDate = e.target.value;
  rawTimelineRangeLabel.textContent = `${rawFilterStartDate || "Start"} ➔ ${rawFilterEndDate || "End"}`;
  rawCurrentPage = 1;
  applyRawFiltersAndPaginate();
});

btnResetRawDates.addEventListener("click", () => {
  rawFilterStartDate = null;
  rawFilterEndDate = null;
  rawTimelineSliderFrom.value = 0;
  rawTimelineSliderTo.value = 100;
  rawDateFromInput.value = timelineMinDate;
  rawDateToInput.value = timelineMaxDate;
  rawTimelineRangeLabel.textContent = "All Dates";
  updateSliderHighlightBar(rawSliderHighlight, 0, 100);
  rawCurrentPage = 1;
  applyRawFiltersAndPaginate();
});

function handleRawPageChange(newPage) {
  const totalPages = Math.ceil(rawFilteredRegistry.length / ITEMS_PER_PAGE) || 1;
  rawCurrentPage = Math.max(1, Math.min(Number(newPage), totalPages));
  applyRawFiltersAndPaginate();
  window.scrollTo({ top: rawGrid.offsetTop - 80, behavior: "smooth" });
}

rawPageJumpTop.addEventListener("change", (e) => handleRawPageChange(e.target.value));
rawPageJumpBottom.addEventListener("change", (e) => handleRawPageChange(e.target.value));
btnRawPrevPageTop.addEventListener("click", () => handleRawPageChange(rawCurrentPage - 1));
btnRawPrevPageBottom.addEventListener("click", () => handleRawPageChange(rawCurrentPage - 1));
btnRawNextPageTop.addEventListener("click", () => handleRawPageChange(rawCurrentPage + 1));
btnRawNextPageBottom.addEventListener("click", () => handleRawPageChange(rawCurrentPage + 1));

// --- 6. TAB 3: Label Search ---
function applyAiFiltersAndPaginate() {
  const source = hasIndexedDbLoaded 
    ? allMediaRegistry.filter(item => item.visualTags || item.ocrText) 
    : demoMediaRegistry;

  const tagQuery = aiSearchQuery.trim().toLowerCase();

  aiFilteredRegistry = source.filter(item => {
    if (!aiSelectedCategories.has(item.category)) return false;
    if (tagQuery && !item.visualTags.toLowerCase().includes(tagQuery)) {
      return false;
    }
    if (aiFilterStartDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) < aiFilterStartDate) return false;
    if (aiFilterEndDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) > aiFilterEndDate) return false;
    return true;
  });

  if (aiSortOrder === "newest") {
    aiFilteredRegistry.sort((a, b) => b.filename.localeCompare(a.filename));
  } else {
    aiFilteredRegistry.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  const total = aiFilteredRegistry.length;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;

  if (aiCurrentPage > totalPages) aiCurrentPage = totalPages;
  if (aiCurrentPage < 1) aiCurrentPage = 1;

  aiPageJumpTop.value = aiCurrentPage;
  aiPageJumpBottom.value = aiCurrentPage;
  aiPageJumpTop.max = totalPages;
  aiPageJumpBottom.max = totalPages;
  aiPageTotalTop.textContent = `/ ${formatNumber(totalPages)}`;
  aiPageTotalBottom.textContent = `/ ${formatNumber(totalPages)}`;

  const isPrevDisabled = aiCurrentPage <= 1;
  const isNextDisabled = aiCurrentPage >= totalPages;
  btnAiPrevPageTop.disabled = isPrevDisabled;
  btnAiPrevPageBottom.disabled = isPrevDisabled;
  btnAiNextPageTop.disabled = isNextDisabled;
  btnAiNextPageBottom.disabled = isNextDisabled;

  const startIdx = (aiCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, total);
  const rangeStr = total > 0 
    ? `Showing ${formatNumber(startIdx + 1)} - ${formatNumber(endIdx)} of ${formatNumber(total)}` 
    : "Showing 0 - 0 of 0";
  aiPageRangeTextTop.textContent = rangeStr;
  aiPageRangeTextBottom.textContent = rangeStr;

  renderAiGrid(aiFilteredRegistry.slice(startIdx, endIdx));
}

function renderAiGrid(items) {
  aiGrid.innerHTML = "";
  if (items.length === 0) {
    aiGrid.appendChild(aiEmptyState);
    if (!hasIndexedDbLoaded && allMediaRegistry.length > 0) {
      aiEmptyMessage.innerHTML = `
        <strong>No AI Database Found (screenshots.db / demo.db)</strong><br><br>
        Your media is loaded in the Media Browser. To enable Label Search for your files, run <code>python qwen-rtx.py</code> on your GPU or use our 100-image cloud demo above.
      `;
    } else {
      aiEmptyMessage.textContent = "No matching tagged media found.";
    }
    aiEmptyState.classList.remove("hidden");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const card = document.createElement("div");
    card.className = "media-item-card";

    let placeholderThumb = "";
    if (item.category === "image") placeholderThumb = `<div class="generic-file-icon">🖼️</div>`;
    else if (item.category === "video") placeholderThumb = `<div class="generic-file-icon">🎥</div>`;
    else placeholderThumb = `<div class="generic-file-icon">📄</div>`;

    const cleanTags = getSanitizedTagsList(item.visualTags);
    const tagsHtml = cleanTags.slice(0, 3).map(t => `<span class="tag-badge">${t}</span>`).join("");

    card.innerHTML = `
      <div class="media-thumb">${placeholderThumb}</div>
      <div class="card-info">
        <div class="card-title-text" title="${item.filename}">${item.filename}</div>
        <div class="card-date-text">${item.timestamp}</div>
        <div class="card-tag-row">${tagsHtml}</div>
      </div>
    `;

    const thumbContainer = card.querySelector(".media-thumb");
    if (item.category === "image" || item.category === "video") {
      resolveItemBlob(item).then(url => {
        if (url && thumbContainer) {
          if (item.category === "image") {
            thumbContainer.innerHTML = `<img src="${url}" alt="${item.filename}" loading="lazy" decoding="async" />`;
          } else {
            thumbContainer.innerHTML = `<video src="${url}" muted preload="metadata"></video>`;
          }
        }
      });
    }

    card.addEventListener("click", () => {
      currentLightboxList = aiFilteredRegistry;
      currentLightboxIndex = (aiCurrentPage - 1) * ITEMS_PER_PAGE + i;
      openLightbox(item, true);
    });
    fragment.appendChild(card);
  }
  aiGrid.appendChild(fragment);
}

// Label Search Input Handlers
let aiDebounceTimer;
aiSearchInput.addEventListener("input", (e) => {
  clearTimeout(aiDebounceTimer);
  aiDebounceTimer = setTimeout(() => {
    aiSearchQuery = e.target.value;
    btnClearAiSearch.classList.toggle("hidden", !aiSearchQuery);
    aiCurrentPage = 1;
    applyAiFiltersAndPaginate();
  }, 150);
});

btnClearAiSearch.addEventListener("click", () => {
  aiSearchInput.value = "";
  aiSearchQuery = "";
  btnClearAiSearch.classList.add("hidden");
  aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
});

aiCategoryFilterGroup.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  const filterCat = pill.dataset.filter;

  if (aiSelectedCategories.has(filterCat)) {
    aiSelectedCategories.delete(filterCat);
    pill.classList.remove("active");
  } else {
    aiSelectedCategories.add(filterCat);
    pill.classList.add("active");
  }

  aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
});

aiSortOrderSelect.addEventListener("change", (e) => {
  aiSortOrder = e.target.value;
  aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
});

btnToggleAiDates.addEventListener("click", () => {
  aiTimelineCard.classList.toggle("hidden");
  btnToggleAiDates.classList.toggle("active", !aiTimelineCard.classList.contains("hidden"));
});

// AI Timeline Dual Slider Handlers
function updateAiTimelineDisplay(startVal, endVal) {
  const minTime = new Date(aiTimelineMinDate).getTime();
  const maxTime = new Date(aiTimelineMaxDate).getTime();
  
  const startTime = new Date(minTime + (maxTime - minTime) * (startVal / 100));
  const endTime = new Date(minTime + (maxTime - minTime) * (endVal / 100));
  
  aiFilterStartDate = startTime.toISOString().slice(0, 10);
  aiFilterEndDate = endTime.toISOString().slice(0, 10);
  
  aiDateFromInput.value = aiFilterStartDate;
  aiDateToInput.value = aiFilterEndDate;
  aiTimelineRangeLabel.textContent = `${aiFilterStartDate} ➔ ${aiFilterEndDate}`;
  updateSliderHighlightBar(aiSliderHighlight, startVal, endVal);
  
  aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
}

aiTimelineSliderFrom.addEventListener("input", (e) => {
  let val = Math.min(Number(e.target.value), Number(aiTimelineSliderTo.value));
  e.target.value = val;
  updateAiTimelineDisplay(val, Number(aiTimelineSliderTo.value));
});

aiTimelineSliderTo.addEventListener("input", (e) => {
  let val = Math.max(Number(e.target.value), Number(aiTimelineSliderFrom.value));
  e.target.value = val;
  updateAiTimelineDisplay(Number(aiTimelineSliderFrom.value), val);
});

aiSliderBox.addEventListener("click", (e) => {
  if (e.target.classList.contains("dual-range-input")) return;
  const rect = aiSliderBox.getBoundingClientRect();
  const clickPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

  const distFrom = Math.abs(clickPercent - Number(aiTimelineSliderFrom.value));
  const distTo = Math.abs(clickPercent - Number(aiTimelineSliderTo.value));

  if (distFrom < distTo) {
    aiTimelineSliderFrom.value = Math.min(clickPercent, Number(aiTimelineSliderTo.value));
  } else {
    aiTimelineSliderTo.value = Math.max(clickPercent, Number(aiTimelineSliderFrom.value));
  }
  updateAiTimelineDisplay(Number(aiTimelineSliderFrom.value), Number(aiTimelineSliderTo.value));
});

aiDateFromInput.addEventListener("change", (e) => {
  aiFilterStartDate = e.target.value;
  aiTimelineRangeLabel.textContent = `${aiFilterStartDate || "Start"} ➔ ${aiFilterEndDate || "End"}`;
  aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
});

aiDateToInput.addEventListener("change", (e) => {
  aiFilterEndDate = e.target.value;
  aiTimelineRangeLabel.textContent = `${aiFilterStartDate || "Start"} ➔ ${aiFilterEndDate || "End"}`;
  aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
});

btnResetAiDates.addEventListener("click", () => {
  aiFilterStartDate = null;
  aiFilterEndDate = null;
  aiTimelineSliderFrom.value = 0;
  aiTimelineSliderTo.value = 100;
  aiDateFromInput.value = aiTimelineMinDate;
  aiDateToInput.value = aiTimelineMaxDate;
  aiTimelineRangeLabel.textContent = "All Dates";
  updateSliderHighlightBar(aiSliderHighlight, 0, 100);
  aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
});

function handleAiPageChange(newPage) {
  const totalPages = Math.ceil(aiFilteredRegistry.length / ITEMS_PER_PAGE) || 1;
  aiCurrentPage = Math.max(1, Math.min(Number(newPage), totalPages));
  applyAiFiltersAndPaginate();
  window.scrollTo({ top: aiGrid.offsetTop - 80, behavior: "smooth" });
}

aiPageJumpTop.addEventListener("change", (e) => handleAiPageChange(e.target.value));
aiPageJumpBottom.addEventListener("change", (e) => handleAiPageChange(e.target.value));
btnAiPrevPageTop.addEventListener("click", () => handleAiPageChange(aiCurrentPage - 1));
btnAiPrevPageBottom.addEventListener("click", () => handleAiPageChange(aiCurrentPage - 1));
btnAiNextPageTop.addEventListener("click", () => handleAiPageChange(aiCurrentPage + 1));
btnAiNextPageBottom.addEventListener("click", () => handleAiPageChange(aiCurrentPage + 1));

// --- 7. Lightbox Modal & Smooth Pan/Zoom ---
function resetImageZoomPan() {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  isDragging = false;
  const img = mediaContainer.querySelector("img");
  if (img) {
    img.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
    img.classList.remove("is-panning");
  }
}

function updateImageTransform() {
  const img = mediaContainer.querySelector("img");
  if (!img) return;
  img.style.transform = `translate3d(${panX}px, ${panY}px, 0px) scale(${zoomScale})`;
}

lightboxMediaPane.addEventListener("wheel", (e) => {
  const img = mediaContainer.querySelector("img");
  if (!img) return;
  e.preventDefault();

  const delta = e.deltaY < 0 ? 0.25 : -0.25;
  zoomScale = Math.min(Math.max(1, zoomScale + delta), 4);

  if (zoomScale === 1) {
    panX = 0;
    panY = 0;
  }
  updateImageTransform();
}, { passive: false });

lightboxMediaPane.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const img = mediaContainer.querySelector("img");
  if (!img || zoomScale <= 1) return;
  
  e.preventDefault();
  isDragging = true;
  startDragX = e.clientX - panX;
  startDragY = e.clientY - panY;
  img.classList.add("is-panning");
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  panX = e.clientX - startDragX;
  panY = e.clientY - startDragY;
  updateImageTransform();
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  const img = mediaContainer.querySelector("img");
  if (img) img.classList.remove("is-panning");
});

async function openLightbox(item, showTags = true) {
  currentLightboxShowTags = showTags;
  lightboxFilename.textContent = item.filename;
  lightboxTimestamp.textContent = `Timestamp: ${item.timestamp}`;
  lightboxSubfolder.textContent = `Subfolder: /${item.ext}`;

  mediaContainer.innerHTML = "";
  resetImageZoomPan();

  const blobUrl = await resolveItemBlob(item);

  if (item.category === "image") {
    const img = document.createElement("img");
    img.src = blobUrl || "";
    img.alt = item.filename;
    img.draggable = false;
    mediaContainer.appendChild(img);
  } else if (item.category === "video") {
    const video = document.createElement("video");
    video.src = blobUrl || "";
    video.controls = true;
    video.autoplay = true;
    mediaContainer.appendChild(video);
  } else if (item.category === "audio") {
    const audio = document.createElement("audio");
    audio.src = blobUrl || "";
    audio.controls = true;
    audio.autoplay = true;
    mediaContainer.appendChild(audio);
  } else {
    mediaContainer.innerHTML = `<div class="generic-file-icon" style="font-size: 5rem;">📄</div>`;
  }

  if (showTags) {
    paneVisualTagsSection.classList.remove("hidden");
    paneOcrTextSection.classList.remove("hidden");
    const validTags = getSanitizedTagsList(item.visualTags);
    lightboxVisualTags.innerHTML = validTags.length > 0
      ? validTags.map(t => `<span class="tag-badge">${t}</span>`).join("")
      : `<span class="tag-none">None detected</span>`;
    lightboxOcrText.textContent = item.ocrText || "No text indexed.";
  } else {
    paneVisualTagsSection.classList.add("hidden");
    paneOcrTextSection.classList.add("hidden");
  }

  btnLightboxPrev.style.display = currentLightboxIndex > 0 ? "flex" : "none";
  btnLightboxNext.style.display = currentLightboxIndex < currentLightboxList.length - 1 ? "flex" : "none";

  lightbox.classList.remove("hidden");
}

function navigateLightbox(direction) {
  const newIndex = currentLightboxIndex + direction;
  if (newIndex >= 0 && newIndex < currentLightboxList.length) {
    const activeVideo = mediaContainer.querySelector("video");
    if (activeVideo) { activeVideo.pause(); activeVideo.src = ""; }
    const activeAudio = mediaContainer.querySelector("audio");
    if (activeAudio) { activeAudio.pause(); activeAudio.src = ""; }

    currentLightboxIndex = newIndex;
    openLightbox(currentLightboxList[currentLightboxIndex], currentLightboxShowTags);
  }
}

btnLightboxPrev.addEventListener("click", () => navigateLightbox(-1));
btnLightboxNext.addEventListener("click", () => navigateLightbox(1));

function closeLightbox() {
  lightbox.classList.add("hidden");
  resetImageZoomPan();
  const activeVideo = mediaContainer.querySelector("video");
  if (activeVideo) { activeVideo.pause(); activeVideo.src = ""; activeVideo.load(); }
  const activeAudio = mediaContainer.querySelector("audio");
  if (activeAudio) { activeAudio.pause(); activeAudio.src = ""; activeAudio.load(); }
  mediaContainer.innerHTML = "";
}

lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
btnCloseLightbox.addEventListener("click", closeLightbox);
window.addEventListener("keydown", (e) => {
  if (lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") navigateLightbox(-1);
  if (e.key === "ArrowRight") navigateLightbox(1);
});

// Dynamic Modal Populator
function openDemoInfoModal() {
  if (IS_LOCAL_HOST) {
    modalTag.textContent = "Offline Demo Gallery";
    modalTitle.textContent = "About the Pre-Indexed Images";
    modalBody.innerHTML = `
      <p>
        The images shown in this view are a <strong>sample demo collection</strong> pre-scanned with <strong>Qwen2.5-VL</strong> to demonstrate offline OCR and visual tag indexing.
      </p>
      <p>
        To generate tags and OCR search for your own downloaded media, run our offline script directly on your GPU (unlimited, faster, and 100% private).
      </p>
      <p class="subtle-note">
        Need help setting it up or have questions? Join our community:
      </p>
      <div class="support-action-row">
        <a href="https://github.com/wyOmar/DisDump" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-modal-action">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          GitHub
        </a>
        <a href="https://discord.gg/kSfuKytUVx" target="_blank" rel="noopener noreferrer" class="btn btn-discord-white btn-modal-action">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Discord Server
        </a>
      </div>
    `;
  } else {
    modalTag.textContent = "Experimental Cloud Demo";
    modalTitle.textContent = "Label Indexing Demo (100~ Images)";
    modalBody.innerHTML = `
      <p>
        Selecting your <code>package.zip</code> here sends attachment URLs to my remote GPUs to test visual tag recognition and OCR search.
      </p>
      <p>
        I fund this 100-image demo out-of-pocket so you can try the label quality before running anything on your own machine. For full archives, running the local script directly on your GPU is strongly recommended (unlimited, faster, and 100% private).
      </p>
      <p>
        If you don't have a dedicated or modern GPU, feel free to reach out on Discord - depending on server capacity, I might be able to help process your archive.
      </p>
      <p class="subtle-note">
        If you found this useful, consider supporting compute costs or joining the discord:
      </p>
      <div class="support-action-row">
        <a href="https://github.com/wyOmar/DisDump" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-modal-action">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          GitHub
        </a>
        <a href="https://discord.gg/kSfuKytUVx" target="_blank" rel="noopener noreferrer" class="btn btn-discord-white btn-modal-action">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Discord Server
        </a>
        <a href="https://ko-fi.com/chanvincent" target="_blank" rel="noopener noreferrer" class="btn btn-kofi btn-modal-action">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.047 3.974-4.047 3.974s-2.8-2.521-4.047-3.974c-1.332-1.554-.832-4.071 1.069-4.57 1.901-.5 2.978 1.002 2.978 1.002s1.077-1.502 2.978-1.002c1.901.499 2.401 3.016 1.069 4.57zm6.305-1.232c-.377 1.99-2.029 2.378-2.029 2.378v-4.834s1.652.466 2.029 2.456z"/>
          </svg>
          Support on Ko-fi
        </a>
      </div>
    `;
  }
  supportModal.classList.remove("hidden");
}

if (btnOpenSupportModal) btnOpenSupportModal.addEventListener("click", openDemoInfoModal);
if (btnOpenLocalDemoInfo) btnOpenLocalDemoInfo.addEventListener("click", openDemoInfoModal);
if (btnCloseSupportModal) btnCloseSupportModal.addEventListener("click", () => supportModal.classList.add("hidden"));
if (supportModal) supportModal.addEventListener("click", (e) => { if (e.target === supportModal) supportModal.classList.add("hidden"); });

// --- 8. Open Existing Folder Workflow ---
async function openExistingFolder() {
  try {
    const pickedHandle = await window.showDirectoryPicker({ 
      mode: "read",
      startIn: "downloads"
    });
    
    let targetHandle = pickedHandle;
    if (pickedHandle.name !== "disdump-download") {
      try {
        targetHandle = await pickedHandle.getDirectoryHandle("disdump-download");
      } catch {
        targetHandle = pickedHandle;
      }
    }

    switchTab("tabRawBrowser");
    downloadStatusBar.classList.remove("hidden");
    dlStatusTitle.textContent = "Scanning folder...";
    dlStatusDetail.textContent = "Discovering files...";
    dlProgressBar.style.width = "20%";

    allMediaRegistry = [];
    rawCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };
    folderHandleCache.clear();
    hasIndexedDbLoaded = false;

    let dbFileHandle = null;
    let dbSourceName = null;

    try {
      dbFileHandle = await targetHandle.getFileHandle("screenshots.db");
      dbSourceName = "screenshots.db (Local Index)";
    } catch {
      try {
        dbFileHandle = await targetHandle.getFileHandle("demo.db");
        dbSourceName = "demo.db (Cloud Demo Index)";
      } catch {}
    }

    let searchMap = new Map();
    if (dbFileHandle) {
      try {
        const f = await dbFileHandle.getFile();
        await initSql();
        activeDb = new sqlEngine.Database(new Uint8Array(await f.arrayBuffer()));
        const res = activeDb.exec("SELECT image_filename, ocr_text, visual_tags FROM screenshot_search");
        if (res.length) {
          for (const [fname, ocr, tags] of res[0].values) {
            searchMap.set(fname, { ocr: ocr || "", tags: tags || "" });
          }
          hasIndexedDbLoaded = true;
        }
      } catch (err) {
        console.warn("Could not query SQLite table", err);
      }
    }

    let scannedFilesCount = 0;

    for await (const [folderName, handle] of targetHandle.entries()) {
      if (handle.kind === "directory") {
        try {
          for await (const [fileName, fileHandle] of handle.entries()) {
            if (fileHandle.kind === "file") {
              const ext = fileName.split(".").pop().toLowerCase();
              const cat = getCategory(ext);
              const dbMatch = searchMap.get(fileName) || { ocr: "", tags: "" };

              rawCategoryCounts[cat] = (rawCategoryCounts[cat] || 0) + 1;

              allMediaRegistry.push({
                id: allMediaRegistry.length,
                filename: fileName,
                ext: ext,
                category: cat,
                timestamp: extractDateFromFilename(fileName),
                fileHandle: fileHandle,
                blobUrl: null,
                url: null,
                ocrText: dbMatch.ocr,
                visualTags: dbMatch.tags
              });

              scannedFilesCount++;
              if (scannedFilesCount % 1000 === 0) {
                dlStatusDetail.textContent = `Found ${formatNumber(scannedFilesCount)} files...`;
                renderBadgeUI();
              }
            }
          }
        } catch (dirErr) {
          console.warn(`Could not read '${folderName}':`, dirErr);
        }
      }
    }

    dlProgressBar.style.width = "100%";
    dlStatusTitle.textContent = "Folder Loaded";
    dlStatusDetail.textContent = `Successfully loaded ${formatNumber(allMediaRegistry.length)} files.`;
    
    setTimeout(() => { downloadStatusBar.classList.add("hidden"); }, 3000);

    updateTimelineBounds();
    updateAiTimelineBounds();
    renderBadgeUI();
    applyRawFiltersAndPaginate();

    aiIndexStatus.textContent = hasIndexedDbLoaded 
      ? `Loaded Local Archive (${formatNumber(allMediaRegistry.filter(i => i.visualTags || i.ocrText).length)} items with ${dbSourceName})`
      : `Loaded Local Archive (${formatNumber(allMediaRegistry.length)} items - No SQLite database found)`;
  } catch (err) {
    downloadStatusBar.classList.add("hidden");
    if (err.name === "SecurityError") {
      alert("Browser Security Notice: Browsers block selecting root folders (like Downloads or Desktop) directly. Please select a subfolder inside them instead (e.g. Downloads/MyMedia).");
    } else if (err.name !== "AbortError") {
      alert("Could not open folder: " + err.message);
    }
  }
}

btnHeroOpenExisting.addEventListener("click", openExistingFolder);
if (btnRawOpenFolder) btnRawOpenFolder.addEventListener("click", openExistingFolder);
if (btnAiOpenFolder) btnAiOpenFolder.addEventListener("click", openExistingFolder);
if (btnEmptyOpenFolder) btnEmptyOpenFolder.addEventListener("click", openExistingFolder);

// --- 9. High-Speed Zip Extraction Pipeline ---
async function extractAllAttachments(file, maxLimit = null) {
  const manifest = [];
  const attachmentUrlRegex = /https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/([0-9]+)\/([0-9]+)\/([^\s"',?]+)(?:\?[^\s"',]*)?/gi;

  return new Promise((resolve, reject) => {
    const unzipper = new fflate.Unzip();
    unzipper.register(fflate.UnzipInflate);

    unzipper.onfile = (entry) => {
      if (entry.name.includes("messages") && (entry.name.endsWith(".json") || entry.name.endsWith(".csv"))) {
        const textChunks = [];
        entry.ondata = (err, chunk, final) => {
          if (err) return;
          textChunks.push(new TextDecoder().decode(chunk));

          if (final) {
            const rawContent = textChunks.join("");
            try {
              const messages = JSON.parse(rawContent);
              if (Array.isArray(messages)) {
                for (const msg of messages) {
                  const timestamp = msg.Timestamp || msg.timestamp || "";
                  const datePrefix = formatDatePrefix(timestamp);
                  const content = (msg.Contents || msg.content || "") + " " + (msg.Attachments || "");

                  let match;
                  while ((match = attachmentUrlRegex.exec(content)) !== null) {
                    const [fullUrl, channelId, attachId, originalFilename] = match;
                    const cleanUrl = normalizeDiscordUrl(fullUrl);
                    const parts = originalFilename.split(".");
                    const ext = parts.length > 1 ? parts.pop().toLowerCase() : "bin";
                    const cleanBase = parts.join(".");
                    const finalFilename = `${datePrefix}_${cleanBase}.${ext}`;

                    manifest.push({
                      id: manifest.length,
                      filename: finalFilename,
                      originalName: originalFilename,
                      ext,
                      category: getCategory(ext),
                      timestamp: timestamp || extractDateFromFilename(finalFilename),
                      url: cleanUrl,
                      blobUrl: null,
                      fileHandle: null,
                      ocrText: "",
                      visualTags: ""
                    });

                    if (maxLimit && manifest.length >= maxLimit) {
                      resolve(manifest.slice(0, maxLimit));
                      return;
                    }
                  }
                }
                return;
              }
            } catch {}

            let match;
            while ((match = attachmentUrlRegex.exec(rawContent)) !== null) {
              const [fullUrl, channelId, attachId, originalFilename] = match;
              const cleanUrl = normalizeDiscordUrl(fullUrl);
              const parts = originalFilename.split(".");
              const ext = parts.length > 1 ? parts.pop().toLowerCase() : "bin";
              const finalFilename = `${formatDatePrefix(null)}_${parts.join(".")}.${ext}`;

              manifest.push({
                id: manifest.length,
                filename: finalFilename,
                originalName: originalFilename,
                ext,
                category: getCategory(ext),
                timestamp: extractDateFromFilename(finalFilename),
                url: cleanUrl,
                blobUrl: null,
                fileHandle: null,
                ocrText: "",
                visualTags: ""
              });

              if (maxLimit && manifest.length >= maxLimit) {
                resolve(manifest.slice(0, maxLimit));
                return;
              }
            }
          }
        };
        entry.start();
      }
    };

    const reader = file.stream().getReader();
    async function pump() {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          unzipper.push(new Uint8Array(0), true);
          resolve(maxLimit ? manifest.slice(0, maxLimit) : manifest);
          break;
        }
        unzipper.push(value, false);
      }
    }
    pump().catch(reject);
  });
}

extractorZipInput.addEventListener("change", (e) => {
  if (!e.target.files.length) return;
  selectedZipFile = e.target.files[0];
  
  if (selectedZipFile.name.toLowerCase() !== "package.zip") {
    selectedZipFilename.textContent = `Selected: ${selectedZipFile.name} (Notice: Ensure this is your unedited Discord data package)`;
  } else {
    selectedZipFilename.textContent = `Selected: ${selectedZipFile.name} (${(selectedZipFile.size / (1024 * 1024)).toFixed(1)} MB)`;
  }
  
  selectedZipFilename.classList.remove("hidden");
  btnStartExportPipeline.disabled = false;
});

btnStartExportPipeline.addEventListener("click", async () => {
  if (!selectedZipFile) return;

  try {
    const parentDirHandle = await window.showDirectoryPicker({ 
      mode: "readwrite",
      startIn: "downloads"
    });
    currentExportDirHandle = await parentDirHandle.getDirectoryHandle("disdump-download", { create: true });
    
    allMediaRegistry = [];
    rawCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };
    rawCurrentPage = 1;
    folderHandleCache.clear();
    isExtractionRunning = true;
    hasIndexedDbLoaded = false;

    switchTab("tabRawBrowser");

    downloadStatusBar.classList.remove("hidden");
    dlStatusTitle.textContent = "Scanning package.zip message history...";

    const manifest = await extractAllAttachments(selectedZipFile);
    const totalFiles = manifest.length;
    dlStatusTitle.textContent = `Downloading & sorting ${formatNumber(totalFiles)} attachments...`;

    const queue = [...manifest];
    const concurrency = 16;
    let savedCount = 0;
    let skippedCount = 0;
    let processedCount = 0;
    let lastUiUpdate = Date.now();
    let hasRenderedLiveInitialBatch = false;

    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        try {
          const resp = await fetch(item.url);
          if (resp.ok) {
            const blob = await resp.blob();
            const subfolder = await getSubfolder(currentExportDirHandle, item.ext);
            
            try {
              const fh = await subfolder.getFileHandle(item.filename, { create: true });
              const w = await fh.createWritable();
              await w.write(blob);
              await w.close();
              item.fileHandle = fh;
            } catch (writeErr) {
              console.warn(`File write skipped: ${item.filename}`, writeErr);
            }

            rawCategoryCounts[item.category] = (rawCategoryCounts[item.category] || 0) + 1;
            allMediaRegistry.push(item);
            savedCount++;

            if (!hasRenderedLiveInitialBatch && (savedCount >= 30 || savedCount === totalFiles)) {
              hasRenderedLiveInitialBatch = true;
              applyRawFiltersAndPaginate();
            }
          } else {
            skippedCount++;
          }
        } catch {
          skippedCount++;
        } finally {
          processedCount++;
          
          const now = Date.now();
          if (now - lastUiUpdate > 100 || processedCount === totalFiles) {
            lastUiUpdate = now;
            const pct = ((processedCount / totalFiles) * 100).toFixed(1);
            dlProgressBar.style.width = `${pct}%`;
            dlStatusDetail.textContent = `${pct}% • ${formatNumber(savedCount)} saved${skippedCount > 0 ? ` (${formatNumber(skippedCount)} expired/deleted)` : ""}`;
            renderBadgeUI();
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    isExtractionRunning = false;
    
    dlStatusTitle.textContent = "Extraction complete!";
    dlStatusDetail.textContent = `All ${formatNumber(savedCount)} available files downloaded into /disdump-download.`;
    
    renderBadgeUI();
    updateTimelineBounds();
    applyRawFiltersAndPaginate();

  } catch (err) {
    isExtractionRunning = false;
    if (err.name === "SecurityError") {
      alert("Browser Security Notice: Browsers block selecting root folders (like Downloads or Desktop) directly. Please open Downloads, create a new folder (e.g. 'MyDiscordMedia'), and select that folder.");
    } else if (err.name !== "AbortError") {
      alert("Export failed: " + err.message);
    }
  }
});

// --- 10. Free 100-Image Cloud GPU Scanner ---
if (cloudZipInput) {
  cloudZipInput.addEventListener("change", (e) => {
    if (!e.target.files.length) return;
    selectedCloudZip = e.target.files[0];
    lblCloudZip.classList.add("hidden");
    btnStartCloudScan.classList.remove("hidden");
    aiIndexStatus.textContent = `Selected ${selectedCloudZip.name}. Step 2: Pick your 'disdump-download' folder to save demo.db & load labels.`;
  });
}

if (btnStartCloudScan) {
  btnStartCloudScan.addEventListener("click", async () => {
    if (!selectedCloudZip) return;

    try {
      const pickedHandle = await window.showDirectoryPicker({ 
        mode: "readwrite",
        startIn: "downloads"
      });
      
      let targetHandle = pickedHandle;
      if (pickedHandle.name !== "disdump-download") {
        try {
          targetHandle = await pickedHandle.getDirectoryHandle("disdump-download", { create: true });
        } catch {
          targetHandle = pickedHandle;
        }
      }

      btnStartCloudScan.classList.add("hidden");
      lblCloudZip.classList.remove("hidden");

      downloadStatusBar.classList.remove("hidden");
      dlStatusTitle.textContent = "Scanning package.zip for images...";
      dlStatusDetail.textContent = "Filtering first 100 images...";
      dlProgressBar.style.width = "10%";

      aiIndexStatus.textContent = "Parsing first 100 image attachments...";
      const rawExtracted = await extractAllAttachments(selectedCloudZip);
      const imageManifest = rawExtracted.filter(m => m.category === "image").slice(0, 100);

      if (!imageManifest.length) {
        aiIndexStatus.textContent = "No image attachments found in package.zip.";
        downloadStatusBar.classList.add("hidden");
        return;
      }

      const localFileMap = new Map();
      try {
        for await (const [folderName, handle] of targetHandle.entries()) {
          if (handle.kind === "directory") {
            for await (const [fileName, fileHandle] of handle.entries()) {
              if (fileHandle.kind === "file") localFileMap.set(fileName, fileHandle);
            }
          } else if (handle.kind === "file") {
            localFileMap.set(folderName, handle);
          }
        }
      } catch (scanErr) {
        console.warn("Could not index local target folder handles:", scanErr);
      }

      for (const item of imageManifest) {
        if (localFileMap.has(item.filename)) {
          item.fileHandle = localFileMap.get(item.filename);
        }
      }

      dlStatusTitle.textContent = "Submitting to GPU Cloud Queue...";
      dlStatusDetail.textContent = `Queuing ${imageManifest.length} images...`;
      dlProgressBar.style.width = "25%";
      aiIndexStatus.textContent = `Submitting ${imageManifest.length} images to Cloud GPU Queue...`;

      const queueResp = await fetch(`${VPS_BASE_URL}/api/queue-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: imageManifest.map(m => ({ filename: m.filename, url: m.url })) })
      });
      
      if (!queueResp.ok) {
        const errData = await queueResp.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned HTTP ${queueResp.status}`);
      }
      
      const { job_id, position } = await queueResp.json();
      activeCloudJobId = job_id;
      isCloudScanningRunning = true;
      let processingTimer = 0;

      const poll = setInterval(async () => {
        try {
          const st = await (await fetch(`${VPS_BASE_URL}/api/job-status/${job_id}`)).json();
          
          if (st.status === "queued") {
            const posText = st.position ? `#${st.position}` : "Next in line";
            dlStatusTitle.textContent = "⏳ Queued for GPU Processing...";
            dlStatusDetail.textContent = `Queue Position: ${posText} • Waiting for GPU turn...`;
            dlProgressBar.style.width = "30%";
            aiIndexStatus.textContent = `Queue Position: ${posText} • Waiting for GPU turn...`;
          }

          if (st.status === "processing") {
            processingTimer += 2.5;
            const dynamicProgress = Math.min(88, 35 + Math.floor(processingTimer * 0.6));
            dlStatusTitle.textContent = "⚡ GPU Active: Labelling with Qwen2.5-VL...";
            dlStatusDetail.textContent = `Labelling ${imageManifest.length} images on NVIDIA L4 GPU (${Math.floor(processingTimer)}s elapsed)...`;
            dlProgressBar.style.width = `${dynamicProgress}%`;
            aiIndexStatus.textContent = `GPU Active: Labelling ${imageManifest.length} images with Qwen2.5-VL...`;
          }

          if (st.status === "completed") {
            clearInterval(poll);
            isCloudScanningRunning = false;
            activeCloudJobId = null;

            dlStatusTitle.textContent = "Saving Demo Database...";
            dlStatusDetail.textContent = "Writing demo.db to folder...";
            dlProgressBar.style.width = "95%";
            aiIndexStatus.textContent = "Saving demo.db to folder...";

            const dbResp = await fetch(`${VPS_BASE_URL}/api/download/${job_id}`);
            const dbBuf = await dbResp.arrayBuffer();

            const dbFile = await targetHandle.getFileHandle("demo.db", { create: true });
            const wr = await dbFile.createWritable();
            await wr.write(dbBuf);
            await wr.close();

            await initSql();
            activeDb = new sqlEngine.Database(new Uint8Array(dbBuf));
            hasIndexedDbLoaded = true;
            
            let searchMap = new Map();
            try {
              const res = activeDb.exec("SELECT image_filename, ocr_text, visual_tags FROM screenshot_search");
              if (res.length) {
                for (const [fn, txt, tg] of res[0].values) searchMap.set(fn, { txt, tg });
              }
            } catch (err) {
              console.warn("Could not query DB", err);
            }

            for (const item of imageManifest) {
              if (searchMap.has(item.filename)) {
                const data = searchMap.get(item.filename);
                item.ocrText = data.txt;
                item.visualTags = data.tg;
              }
            }

            allMediaRegistry = imageManifest;
            rawCategoryCounts = { image: imageManifest.length, video: 0, audio: 0, doc: 0, other: 0 };
            
            updateTimelineBounds();
            updateAiTimelineBounds();
            renderBadgeUI();

            dlProgressBar.style.width = "100%";
            dlStatusTitle.textContent = "Labelling Complete!";
            dlStatusDetail.textContent = `Successfully saved demo.db and indexed ${imageManifest.length} images.`;
            aiIndexStatus.textContent = `Active Cloud Demo Index (${imageManifest.length} images indexed)`;
            
            setTimeout(() => { downloadStatusBar.classList.add("hidden"); }, 4000);
            applyAiFiltersAndPaginate();
          }

          if (st.status === "failed") {
            clearInterval(poll);
            isCloudScanningRunning = false;
            activeCloudJobId = null;
            downloadStatusBar.classList.add("hidden");
            aiIndexStatus.textContent = `Error: ${st.error || "Processing failed"}`;
          }
        } catch (pollErr) {
          console.warn("Status poll error:", pollErr);
        }
      }, 2500);

    } catch (err) {
      isCloudScanningRunning = false;
      activeCloudJobId = null;
      downloadStatusBar.classList.add("hidden");
      if (err.name === "SecurityError") {
        alert("Browser Security Notice: Browsers block selecting root folders (like Downloads or Desktop) directly. Please select a subfolder inside them instead (e.g. Downloads/MyMedia).");
      } else if (err.name !== "AbortError") {
        aiIndexStatus.textContent = "Error: " + err.message;
      }
    }
  });
}

// App Startup
window.addEventListener("DOMContentLoaded", () => {
  setupEnvironmentMode();
  loadDemoVault();
  applyRawFiltersAndPaginate();
});