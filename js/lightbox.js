import { state } from "./state.js";
import { dom } from "./dom.js";
import { resolveItemBlob, getSanitizedTagsList } from "./utils.js";

export function resetImageZoomPan() {
  state.zoomScale = 1;
  state.panX = 0;
  state.panY = 0;
  state.isDragging = false;
  const img = dom.mediaContainer.querySelector("img");
  if (img) {
    img.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
    img.classList.remove("is-panning");
  }
}

export function updateImageTransform() {
  const img = dom.mediaContainer.querySelector("img");
  if (!img) return;
  img.style.transform = `translate3d(${state.panX}px, ${state.panY}px, 0px) scale(${state.zoomScale})`;
}

export async function openLightbox(item, showTags = true) {
  state.currentLightboxShowTags = showTags;
  dom.lightboxFilename.textContent = item.filename;
  dom.lightboxTimestamp.textContent = `Timestamp: ${item.timestamp}`;
  dom.lightboxSubfolder.textContent = `Subfolder: /${item.ext}`;

  dom.mediaContainer.innerHTML = "";
  resetImageZoomPan();

  const blobUrl = await resolveItemBlob(item);

  if (item.category === "image") {
    const img = document.createElement("img");
    img.src = blobUrl || "";
    img.alt = item.filename;
    img.draggable = false;
    dom.mediaContainer.appendChild(img);
  } else if (item.category === "video") {
    const video = document.createElement("video");
    video.src = blobUrl || "";
    video.controls = true;
    video.autoplay = true;
    dom.mediaContainer.appendChild(video);
  } else if (item.category === "audio") {
    const audio = document.createElement("audio");
    audio.src = blobUrl || "";
    audio.controls = true;
    audio.autoplay = true;
    dom.mediaContainer.appendChild(audio);
  } else {
    dom.mediaContainer.innerHTML = `<div class="generic-file-icon" style="font-size: 5rem;">📄</div>`;
  }

  if (showTags) {
    dom.paneVisualTagsSection.classList.remove("hidden");
    dom.paneOcrTextSection.classList.remove("hidden");
    const validTags = getSanitizedTagsList(item.visualTags);
    dom.lightboxVisualTags.innerHTML = validTags.length > 0
      ? validTags.map(t => `<span class="tag-badge">${t}</span>`).join("")
      : `<span class="tag-none">None detected</span>`;
    dom.lightboxOcrText.textContent = item.ocrText || "No text indexed.";
  } else {
    dom.paneVisualTagsSection.classList.add("hidden");
    dom.paneOcrTextSection.classList.add("hidden");
  }

  dom.btnLightboxPrev.style.display = state.currentLightboxIndex > 0 ? "flex" : "none";
  dom.btnLightboxNext.style.display = state.currentLightboxIndex < state.currentLightboxList.length - 1 ? "flex" : "none";

  dom.lightbox.classList.remove("hidden");
}

export function navigateLightbox(direction) {
  const newIndex = state.currentLightboxIndex + direction;
  if (newIndex >= 0 && newIndex < state.currentLightboxList.length) {
    const activeVideo = dom.mediaContainer.querySelector("video");
    if (activeVideo) { activeVideo.pause(); activeVideo.src = ""; }
    const activeAudio = dom.mediaContainer.querySelector("audio");
    if (activeAudio) { activeAudio.pause(); activeAudio.src = ""; }

    state.currentLightboxIndex = newIndex;
    openLightbox(state.currentLightboxList[state.currentLightboxIndex], state.currentLightboxShowTags);
  }
}

export function closeLightbox() {
  dom.lightbox.classList.add("hidden");
  resetImageZoomPan();
  const activeVideo = dom.mediaContainer.querySelector("video");
  if (activeVideo) { activeVideo.pause(); activeVideo.src = ""; activeVideo.load(); }
  const activeAudio = dom.mediaContainer.querySelector("audio");
  if (activeAudio) { activeAudio.pause(); activeAudio.src = ""; activeAudio.load(); }
  dom.mediaContainer.innerHTML = "";
}

export function setupLightboxEvents() {
  dom.lightboxMediaPane.addEventListener("wheel", (e) => {
    const img = dom.mediaContainer.querySelector("img");
    if (!img) return;
    e.preventDefault();

    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    state.zoomScale = Math.min(Math.max(1, state.zoomScale + delta), 4);

    if (state.zoomScale === 1) {
      state.panX = 0;
      state.panY = 0;
    }
    updateImageTransform();
  }, { passive: false });

  dom.lightboxMediaPane.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const img = dom.mediaContainer.querySelector("img");
    if (!img || state.zoomScale <= 1) return;
    
    e.preventDefault();
    state.isDragging = true;
    state.startDragX = e.clientX - state.panX;
    state.startDragY = e.clientY - state.panY;
    img.classList.add("is-panning");
  });

  window.addEventListener("mousemove", (e) => {
    if (!state.isDragging) return;
    state.panX = e.clientX - state.startDragX;
    state.panY = e.clientY - state.startDragY;
    updateImageTransform();
  });

  window.addEventListener("mouseup", () => {
    state.isDragging = false;
    const img = dom.mediaContainer.querySelector("img");
    if (img) img.classList.remove("is-panning");
  });

  dom.btnLightboxPrev.addEventListener("click", () => navigateLightbox(-1));
  dom.btnLightboxNext.addEventListener("click", () => navigateLightbox(1));
  dom.btnCloseLightbox.addEventListener("click", closeLightbox);

  dom.lightbox.addEventListener("click", (e) => {
    if (e.target === dom.lightbox) closeLightbox();
  });

  window.addEventListener("keydown", (e) => {
    if (dom.lightbox.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") navigateLightbox(-1);
    if (e.key === "ArrowRight") navigateLightbox(1);
  });
}