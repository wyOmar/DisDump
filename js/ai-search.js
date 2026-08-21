import { state, ITEMS_PER_PAGE } from "./state.js";
import { dom } from "./dom.js";
import { formatNumber, resolveItemBlob, getSanitizedTagsList } from "./utils.js";
import { updateSliderHighlightBar } from "./raw-browser.js";
import { openLightbox } from "./lightbox.js";

export function updateAiTimelineBounds() {
  const source = state.hasIndexedDbLoaded 
    ? state.allMediaRegistry.filter(item => item.visualTags || item.ocrText) 
    : state.demoMediaRegistry;
  if (!source.length) return;
  const timestamps = source
    .map(m => m.timestamp)
    .filter(t => t && t.length >= 10 && t !== "Unknown")
    .sort();

  if (timestamps.length) {
    state.aiTimelineMinDate = timestamps[0].slice(0, 10);
    state.aiTimelineMaxDate = timestamps[timestamps.length - 1].slice(0, 10);
    dom.aiDateFromInput.min = state.aiTimelineMinDate;
    dom.aiDateFromInput.max = state.aiTimelineMaxDate;
    dom.aiDateToInput.min = state.aiTimelineMinDate;
    dom.aiDateToInput.max = state.aiTimelineMaxDate;
    dom.aiDateFromInput.value = state.aiTimelineMinDate;
    dom.aiDateToInput.value = state.aiTimelineMaxDate;
    dom.aiTimelineRangeLabel.textContent = `${state.aiTimelineMinDate} ➔ ${state.aiTimelineMaxDate}`;
    updateSliderHighlightBar(dom.aiSliderHighlight, 0, 100);
  }
}

export function updateAiTimelineDisplay(startVal, endVal) {
  const minTime = new Date(state.aiTimelineMinDate).getTime();
  const maxTime = new Date(state.aiTimelineMaxDate).getTime();
  
  const startTime = new Date(minTime + (maxTime - minTime) * (startVal / 100));
  const endTime = new Date(minTime + (maxTime - minTime) * (endVal / 100));
  
  state.aiFilterStartDate = startTime.toISOString().slice(0, 10);
  state.aiFilterEndDate = endTime.toISOString().slice(0, 10);
  
  dom.aiDateFromInput.value = state.aiFilterStartDate;
  dom.aiDateToInput.value = state.aiFilterEndDate;
  dom.aiTimelineRangeLabel.textContent = `${state.aiFilterStartDate} ➔ ${state.aiFilterEndDate}`;
  updateSliderHighlightBar(dom.aiSliderHighlight, startVal, endVal);
  
  state.aiCurrentPage = 1;
  applyAiFiltersAndPaginate();
}

export function applyAiFiltersAndPaginate() {
  const source = state.hasIndexedDbLoaded 
    ? state.allMediaRegistry.filter(item => item.visualTags || item.ocrText) 
    : state.demoMediaRegistry;

  const tagQuery = state.aiSearchQuery.trim().toLowerCase();

  state.aiFilteredRegistry = source.filter(item => {
    if (!state.aiSelectedCategories.has(item.category)) return false;
    if (tagQuery && !item.visualTags.toLowerCase().includes(tagQuery)) {
      return false;
    }
    if (state.aiFilterStartDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) < state.aiFilterStartDate) return false;
    if (state.aiFilterEndDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) > state.aiFilterEndDate) return false;
    return true;
  });

  if (state.aiSortOrder === "newest") {
    state.aiFilteredRegistry.sort((a, b) => b.filename.localeCompare(a.filename));
  } else {
    state.aiFilteredRegistry.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  const total = state.aiFilteredRegistry.length;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;

  if (state.aiCurrentPage > totalPages) state.aiCurrentPage = totalPages;
  if (state.aiCurrentPage < 1) state.aiCurrentPage = 1;

  dom.aiPageJumpTop.value = state.aiCurrentPage;
  dom.aiPageJumpBottom.value = state.aiCurrentPage;
  dom.aiPageJumpTop.max = totalPages;
  dom.aiPageJumpBottom.max = totalPages;
  dom.aiPageTotalTop.textContent = `/ ${formatNumber(totalPages)}`;
  dom.aiPageTotalBottom.textContent = `/ ${formatNumber(totalPages)}`;

  const isPrevDisabled = state.aiCurrentPage <= 1;
  const isNextDisabled = state.aiCurrentPage >= totalPages;
  dom.btnAiPrevPageTop.disabled = isPrevDisabled;
  dom.btnAiPrevPageBottom.disabled = isPrevDisabled;
  dom.btnAiNextPageTop.disabled = isNextDisabled;
  dom.btnAiNextPageBottom.disabled = isNextDisabled;

  const startIdx = (state.aiCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, total);
  const rangeStr = total > 0 
    ? `Showing ${formatNumber(startIdx + 1)} - ${formatNumber(endIdx)} of ${formatNumber(total)}` 
    : "Showing 0 - 0 of 0";
  dom.aiPageRangeTextTop.textContent = rangeStr;
  dom.aiPageRangeTextBottom.textContent = rangeStr;

  renderAiGrid(state.aiFilteredRegistry.slice(startIdx, endIdx));
}

export function renderAiGrid(items) {
  dom.aiGrid.innerHTML = "";
  if (items.length === 0) {
    dom.aiGrid.appendChild(dom.aiEmptyState);
    if (!state.hasIndexedDbLoaded && state.allMediaRegistry.length > 0) {
      dom.aiEmptyMessage.innerHTML = `
        <strong>No AI Database Found (screenshots.db / demo.db)</strong><br><br>
        Your media is loaded in My Attachments. To enable Label Search for your files, run <code>python qwen-rtx.py</code> on your GPU or use our 100-image cloud demo above.
      `;
    } else {
      dom.aiEmptyMessage.textContent = "No matching tagged media found.";
    }
    dom.aiEmptyState.classList.remove("hidden");
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
      state.currentLightboxList = state.aiFilteredRegistry;
      state.currentLightboxIndex = (state.aiCurrentPage - 1) * ITEMS_PER_PAGE + i;
      openLightbox(item, true);
    });
    fragment.appendChild(card);
  }
  dom.aiGrid.appendChild(fragment);
}

export function handleAiPageChange(newPage) {
  const totalPages = Math.ceil(state.aiFilteredRegistry.length / ITEMS_PER_PAGE) || 1;
  state.aiCurrentPage = Math.max(1, Math.min(Number(newPage), totalPages));
  applyAiFiltersAndPaginate();
  window.scrollTo({ top: dom.aiGrid.offsetTop - 80, behavior: "smooth" });
}

export function setupAiSearchEvents() {
  let aiDebounceTimer;
  dom.aiSearchInput.addEventListener("input", (e) => {
    clearTimeout(aiDebounceTimer);
    aiDebounceTimer = setTimeout(() => {
      state.aiSearchQuery = e.target.value;
      dom.btnClearAiSearch.classList.toggle("hidden", !state.aiSearchQuery);
      state.aiCurrentPage = 1;
      applyAiFiltersAndPaginate();
    }, 150);
  });

  dom.btnClearAiSearch.addEventListener("click", () => {
    dom.aiSearchInput.value = "";
    state.aiSearchQuery = "";
    dom.btnClearAiSearch.classList.add("hidden");
    state.aiCurrentPage = 1;
    applyAiFiltersAndPaginate();
  });

  dom.aiCategoryFilterGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const filterCat = pill.dataset.filter;

    if (state.aiSelectedCategories.has(filterCat)) {
      state.aiSelectedCategories.delete(filterCat);
      pill.classList.remove("active");
    } else {
      state.aiSelectedCategories.add(filterCat);
      pill.classList.add("active");
    }

    state.aiCurrentPage = 1;
    applyAiFiltersAndPaginate();
  });

  dom.aiSortOrderSelect.addEventListener("change", (e) => {
    state.aiSortOrder = e.target.value;
    state.aiCurrentPage = 1;
    applyAiFiltersAndPaginate();
  });

  dom.btnToggleAiDates.addEventListener("click", () => {
    dom.aiTimelineCard.classList.toggle("hidden");
    dom.btnToggleAiDates.classList.toggle("active", !dom.aiTimelineCard.classList.contains("hidden"));
  });

  dom.aiTimelineSliderFrom.addEventListener("input", (e) => {
    let val = Math.min(Number(e.target.value), Number(dom.aiTimelineSliderTo.value));
    e.target.value = val;
    updateAiTimelineDisplay(val, Number(dom.aiTimelineSliderTo.value));
  });

  dom.aiTimelineSliderTo.addEventListener("input", (e) => {
    let val = Math.max(Number(e.target.value), Number(dom.aiTimelineSliderFrom.value));
    e.target.value = val;
    updateAiTimelineDisplay(Number(dom.aiTimelineSliderFrom.value), val);
  });

  dom.aiSliderBox.addEventListener("click", (e) => {
    if (e.target.classList.contains("dual-range-input")) return;
    const rect = dom.aiSliderBox.getBoundingClientRect();
    const clickPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

    const distFrom = Math.abs(clickPercent - Number(dom.aiTimelineSliderFrom.value));
    const distTo = Math.abs(clickPercent - Number(dom.aiTimelineSliderTo.value));

    if (distFrom < distTo) {
      dom.aiTimelineSliderFrom.value = Math.min(clickPercent, Number(dom.aiTimelineSliderTo.value));
    } else {
      dom.aiTimelineSliderTo.value = Math.max(clickPercent, Number(dom.aiTimelineSliderFrom.value));
    }
    updateAiTimelineDisplay(Number(dom.aiTimelineSliderFrom.value), Number(dom.aiTimelineSliderTo.value));
  });

  dom.aiDateFromInput.addEventListener("change", (e) => {
    state.aiFilterStartDate = e.target.value;
    dom.aiTimelineRangeLabel.textContent = `${state.aiFilterStartDate || "Start"} ➔ ${state.aiFilterEndDate || "End"}`;
    state.aiCurrentPage = 1;
    applyAiFiltersAndPaginate();
  });

  dom.aiDateToInput.addEventListener("change", (e) => {
    state.aiFilterEndDate = e.target.value;
    dom.aiTimelineRangeLabel.textContent = `${state.aiFilterStartDate || "Start"} ➔ ${state.aiFilterEndDate || "End"}`;
    state.aiCurrentPage = 1;
    applyAiFiltersAndPaginate();
  });

  dom.btnResetAiDates.addEventListener("click", () => {
    state.aiFilterStartDate = null;
    state.aiFilterEndDate = null;
    dom.aiTimelineSliderFrom.value = 0;
    dom.aiTimelineSliderTo.value = 100;
    dom.aiDateFromInput.value = state.aiTimelineMinDate;
    dom.aiDateToInput.value = state.aiTimelineMaxDate;
    dom.aiTimelineRangeLabel.textContent = "All Dates";
    updateSliderHighlightBar(dom.aiSliderHighlight, 0, 100);
    state.aiCurrentPage = 1;
    applyAiFiltersAndPaginate();
  });

  dom.aiPageJumpTop.addEventListener("change", (e) => handleAiPageChange(e.target.value));
  dom.aiPageJumpBottom.addEventListener("change", (e) => handleAiPageChange(e.target.value));
  dom.btnAiPrevPageTop.addEventListener("click", () => handleAiPageChange(state.aiCurrentPage - 1));
  dom.btnAiPrevPageBottom.addEventListener("click", () => handleAiPageChange(state.aiCurrentPage - 1));
  dom.btnAiNextPageTop.addEventListener("click", () => handleAiPageChange(state.aiCurrentPage + 1));
  dom.btnAiNextPageBottom.addEventListener("click", () => handleAiPageChange(state.aiCurrentPage + 1));
}