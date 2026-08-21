import { state, ITEMS_PER_PAGE } from "./state.js";
import { dom } from "./dom.js";
import { formatNumber, resolveItemBlob } from "./utils.js";
import { openLightbox } from "./lightbox.js";

export function updateTimelineBounds() {
  if (!state.allMediaRegistry.length) return;
  const timestamps = state.allMediaRegistry
    .map(m => m.timestamp)
    .filter(t => t && t.length >= 10 && t !== "Unknown" && t !== "Demo Archive" && t !== "Local Archive")
    .sort();

  if (timestamps.length) {
    state.timelineMinDate = timestamps[0].slice(0, 10);
    state.timelineMaxDate = timestamps[timestamps.length - 1].slice(0, 10);
    dom.rawDateFromInput.min = state.timelineMinDate;
    dom.rawDateFromInput.max = state.timelineMaxDate;
    dom.rawDateToInput.min = state.timelineMinDate;
    dom.rawDateToInput.max = state.timelineMaxDate;
    dom.rawDateFromInput.value = state.timelineMinDate;
    dom.rawDateToInput.value = state.timelineMaxDate;
    dom.rawTimelineRangeLabel.textContent = `${state.timelineMinDate} ➔ ${state.timelineMaxDate}`;
    updateSliderHighlightBar(dom.rawSliderHighlight, 0, 100);
  }
}

export function updateSliderHighlightBar(highlightElement, fromVal, toVal) {
  highlightElement.style.left = `${fromVal}%`;
  highlightElement.style.width = `${toVal - fromVal}%`;
}

export function updateTimelineDisplay(startVal, endVal) {
  const minTime = new Date(state.timelineMinDate).getTime();
  const maxTime = new Date(state.timelineMaxDate).getTime();
  
  const startTime = new Date(minTime + (maxTime - minTime) * (startVal / 100));
  const endTime = new Date(minTime + (maxTime - minTime) * (endVal / 100));
  
  state.rawFilterStartDate = startTime.toISOString().slice(0, 10);
  state.rawFilterEndDate = endTime.toISOString().slice(0, 10);
  
  dom.rawDateFromInput.value = state.rawFilterStartDate;
  dom.rawDateToInput.value = state.rawFilterEndDate;
  dom.rawTimelineRangeLabel.textContent = `${state.rawFilterStartDate} ➔ ${state.rawFilterEndDate}`;
  updateSliderHighlightBar(dom.rawSliderHighlight, startVal, endVal);
  
  state.rawCurrentPage = 1;
  applyRawFiltersAndPaginate();
}

export function updateRawPaginationUI() {
  const total = state.rawFilteredRegistry.length;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;

  if (state.rawCurrentPage > totalPages) state.rawCurrentPage = totalPages;
  if (state.rawCurrentPage < 1) state.rawCurrentPage = 1;

  dom.rawPageJumpTop.value = state.rawCurrentPage;
  dom.rawPageJumpBottom.value = state.rawCurrentPage;
  dom.rawPageJumpTop.max = totalPages;
  dom.rawPageJumpBottom.max = totalPages;
  dom.rawPageTotalTop.textContent = `/ ${formatNumber(totalPages)}`;
  dom.rawPageTotalBottom.textContent = `/ ${formatNumber(totalPages)}`;

  const isPrevDisabled = state.rawCurrentPage <= 1;
  const isNextDisabled = state.rawCurrentPage >= totalPages;
  dom.btnRawPrevPageTop.disabled = isPrevDisabled;
  dom.btnRawPrevPageBottom.disabled = isPrevDisabled;
  dom.btnRawNextPageTop.disabled = isNextDisabled;
  dom.btnRawNextPageBottom.disabled = isNextDisabled;

  const startIdx = (state.rawCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, total);
  const rangeStr = total > 0 
    ? `Showing ${formatNumber(startIdx + 1)} - ${formatNumber(endIdx)} of ${formatNumber(total)}` 
    : "Showing 0 - 0 of 0";
  dom.rawPageRangeTextTop.textContent = rangeStr;
  dom.rawPageRangeTextBottom.textContent = rangeStr;
}

export function applyRawFiltersAndPaginate() {
  if (state.allMediaRegistry.length === 0) {
    dom.rawBrowserToolbar.classList.add("hidden");
    dom.rawTimelineCard.classList.add("hidden");
    dom.rawTopPagination.classList.add("hidden");
    dom.rawBottomPagination.classList.add("hidden");
    renderRawGrid([]);
    return;
  }

  dom.rawBrowserToolbar.classList.remove("hidden");
  dom.rawTopPagination.classList.remove("hidden");
  dom.rawBottomPagination.classList.remove("hidden");

  state.rawFilteredRegistry = state.allMediaRegistry.filter(item => {
    if (!state.rawSelectedCategories.has(item.category)) return false;
    if (state.rawFilterStartDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) < state.rawFilterStartDate) return false;
    if (state.rawFilterEndDate && item.timestamp >= "2000" && item.timestamp.slice(0, 10) > state.rawFilterEndDate) return false;
    return true;
  });

  if (state.rawSortOrder === "newest") {
    state.rawFilteredRegistry.sort((a, b) => b.filename.localeCompare(a.filename));
  } else {
    state.rawFilteredRegistry.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  updateRawPaginationUI();

  const startIdx = (state.rawCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, state.rawFilteredRegistry.length);
  renderRawGrid(state.rawFilteredRegistry.slice(startIdx, endIdx));
}

export function renderRawGrid(items) {
  dom.rawGrid.innerHTML = "";
  if (items.length === 0) {
    dom.rawGrid.appendChild(dom.rawEmptyState);
    if (state.allMediaRegistry.length > 0) {
      dom.rawEmptyMessage.textContent = "No media files match your current category or date filters.";
      dom.rawEmptyCtaGroup.classList.add("hidden");
    } else {
      dom.rawEmptyMessage.textContent = "No media files loaded yet.";
      dom.rawEmptyCtaGroup.classList.remove("hidden");
    }
    dom.rawEmptyState.classList.remove("hidden");
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
      state.currentLightboxList = state.rawFilteredRegistry;
      state.currentLightboxIndex = (state.rawCurrentPage - 1) * ITEMS_PER_PAGE + i;
      openLightbox(item, false);
    });
    fragment.appendChild(card);
  }
  dom.rawGrid.appendChild(fragment);
}

export function handleRawPageChange(newPage) {
  const totalPages = Math.ceil(state.rawFilteredRegistry.length / ITEMS_PER_PAGE) || 1;
  state.rawCurrentPage = Math.max(1, Math.min(Number(newPage), totalPages));
  applyRawFiltersAndPaginate();
  window.scrollTo({ top: dom.rawGrid.offsetTop - 80, behavior: "smooth" });
}

export function setupRawBrowserEvents() {
  dom.rawCategoryFilterGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const filterCat = pill.dataset.filter;

    if (state.rawSelectedCategories.has(filterCat)) {
      state.rawSelectedCategories.delete(filterCat);
      pill.classList.remove("active");
    } else {
      state.rawSelectedCategories.add(filterCat);
      pill.classList.add("active");
    }

    state.rawCurrentPage = 1;
    applyRawFiltersAndPaginate();
  });

  dom.rawSortOrderSelect.addEventListener("change", (e) => {
    state.rawSortOrder = e.target.value;
    state.rawCurrentPage = 1;
    applyRawFiltersAndPaginate();
  });

  dom.btnToggleRawDates.addEventListener("click", () => {
    dom.rawTimelineCard.classList.toggle("hidden");
    dom.btnToggleRawDates.classList.toggle("active", !dom.rawTimelineCard.classList.contains("hidden"));
  });

  dom.rawTimelineSliderFrom.addEventListener("input", (e) => {
    let val = Math.min(Number(e.target.value), Number(dom.rawTimelineSliderTo.value));
    e.target.value = val;
    updateTimelineDisplay(val, Number(dom.rawTimelineSliderTo.value));
  });

  dom.rawTimelineSliderTo.addEventListener("input", (e) => {
    let val = Math.max(Number(e.target.value), Number(dom.rawTimelineSliderFrom.value));
    e.target.value = val;
    updateTimelineDisplay(Number(dom.rawTimelineSliderFrom.value), val);
  });

  dom.rawSliderBox.addEventListener("click", (e) => {
    if (e.target.classList.contains("dual-range-input")) return;
    const rect = dom.rawSliderBox.getBoundingClientRect();
    const clickPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

    const distFrom = Math.abs(clickPercent - Number(dom.rawTimelineSliderFrom.value));
    const distTo = Math.abs(clickPercent - Number(dom.rawTimelineSliderTo.value));

    if (distFrom < distTo) {
      dom.rawTimelineSliderFrom.value = Math.min(clickPercent, Number(dom.rawTimelineSliderTo.value));
    } else {
      dom.rawTimelineSliderTo.value = Math.max(clickPercent, Number(dom.rawTimelineSliderFrom.value));
    }
    updateTimelineDisplay(Number(dom.rawTimelineSliderFrom.value), Number(dom.rawTimelineSliderTo.value));
  });

  dom.rawDateFromInput.addEventListener("change", (e) => {
    state.rawFilterStartDate = e.target.value;
    dom.rawTimelineRangeLabel.textContent = `${state.rawFilterStartDate || "Start"} ➔ ${state.rawFilterEndDate || "End"}`;
    state.rawCurrentPage = 1;
    applyRawFiltersAndPaginate();
  });

  dom.rawDateToInput.addEventListener("change", (e) => {
    state.rawFilterEndDate = e.target.value;
    dom.rawTimelineRangeLabel.textContent = `${state.rawFilterStartDate || "Start"} ➔ ${state.rawFilterEndDate || "End"}`;
    state.rawCurrentPage = 1;
    applyRawFiltersAndPaginate();
  });

  dom.btnResetRawDates.addEventListener("click", () => {
    state.rawFilterStartDate = null;
    state.rawFilterEndDate = null;
    dom.rawTimelineSliderFrom.value = 0;
    dom.rawTimelineSliderTo.value = 100;
    dom.rawDateFromInput.value = state.timelineMinDate;
    dom.rawDateToInput.value = state.timelineMaxDate;
    dom.rawTimelineRangeLabel.textContent = "All Dates";
    updateSliderHighlightBar(dom.rawSliderHighlight, 0, 100);
    state.rawCurrentPage = 1;
    applyRawFiltersAndPaginate();
  });

  dom.rawPageJumpTop.addEventListener("change", (e) => handleRawPageChange(e.target.value));
  dom.rawPageJumpBottom.addEventListener("change", (e) => handleRawPageChange(e.target.value));
  dom.btnRawPrevPageTop.addEventListener("click", () => handleRawPageChange(state.rawCurrentPage - 1));
  dom.btnRawPrevPageBottom.addEventListener("click", () => handleRawPageChange(state.rawCurrentPage - 1));
  dom.btnRawNextPageTop.addEventListener("click", () => handleRawPageChange(state.rawCurrentPage + 1));
  dom.btnRawNextPageBottom.addEventListener("click", () => handleRawPageChange(state.rawCurrentPage + 1));
}