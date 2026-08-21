import { state, VPS_BASE_URL } from "./js/state.js";
import { dom } from "./js/dom.js";
import { setupModalEvents, openDemoInfoModal } from "./js/modals.js";
import { setupLightboxEvents } from "./js/lightbox.js";
import { setupRawBrowserEvents, applyRawFiltersAndPaginate } from "./js/raw-browser.js";
import { setupAiSearchEvents, applyAiFiltersAndPaginate } from "./js/ai-search.js";
import { setupExtractorEvents, loadDemoVault } from "./js/extractor.js";
import { setupCloudScannerEvents, updateCloudScannerVisibility } from "./js/cloud-scanner.js";

// Global Tab Switcher accessible to inline handlers
window.switchTab = function(targetId) {
  if (dom.supportModal) dom.supportModal.classList.add("hidden");
  if (dom.browserWarningModal) dom.browserWarningModal.classList.add("hidden");

  dom.navTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === targetId));
  dom.screenViews.forEach(v => v.classList.toggle("active", v.id === targetId));

  if (targetId === "tabRawBrowser") {
    applyRawFiltersAndPaginate();
  }

  if (targetId === "tabAiSearch") {
    applyAiFiltersAndPaginate();
    if (!state.hasShownLabelDemoModal) {
      openDemoInfoModal();
      state.hasShownLabelDemoModal = true;
    }
  }
};

function setupNavigation() {
  dom.navTabs.forEach(tab => {
    tab.addEventListener("click", () => window.switchTab(tab.dataset.tab));
  });
  dom.navBrand.addEventListener("click", () => window.switchTab("tabExtractor"));
  dom.btnViewLive.addEventListener("click", () => window.switchTab("tabRawBrowser"));
}

function setupEnvironmentMode() {
  updateCloudScannerVisibility();

  if (typeof window.showDirectoryPicker !== "function") {
    if (dom.browserWarningModal) {
      dom.browserWarningModal.classList.remove("hidden");
    }
  }
}

// Window Unload & Safety Handlers
window.addEventListener("beforeunload", (e) => {
  if (state.isExtractionRunning || state.isCloudScanningRunning) {
    e.preventDefault();
    e.returnValue = "Processing is currently in progress. Leaving this page will abort extraction or remove you from the cloud queue.";
    return e.returnValue;
  }
});

window.addEventListener("pagehide", () => {
  if (state.activeCloudJobId && state.isCloudScanningRunning) {
    fetch(`${VPS_BASE_URL}/api/cancel-job/${state.activeCloudJobId}`, {
      method: "POST",
      keepalive: true
    }).catch(() => {});
  }
});

// App Startup Bootstrapper
window.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupModalEvents();
  setupLightboxEvents();
  setupRawBrowserEvents();
  setupAiSearchEvents();
  setupExtractorEvents();
  setupCloudScannerEvents();

  setupEnvironmentMode();
  loadDemoVault();
  applyRawFiltersAndPaginate();
});