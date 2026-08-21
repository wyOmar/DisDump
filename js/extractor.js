import { state } from "./state.js";
import { dom } from "./dom.js";
import {
  formatNumber,
  getCategory,
  normalizeDiscordUrl,
  extractDateFromFilename,
  formatDatePrefix,
  initSql,
  getSubfolder,
  clearAllBlobUrls,
  renderBadgeUI
} from "./utils.js";
import { updateTimelineBounds, updateRawPaginationUI, applyRawFiltersAndPaginate } from "./raw-browser.js";
import { updateAiTimelineBounds } from "./ai-search.js";
import { updateCloudScannerVisibility } from "./cloud-scanner.js";
import { openCompletionModal } from "./modals.js";

export async function extractAllAttachments(file, maxLimit = null) {
  const manifest = [];
  const attachmentUrlRegex = /https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/([0-9]+)\/([0-9]+)\/([^\s"',?]+)(?:\?[^\s"',]*)?/gi;

  return new Promise((resolve, reject) => {
    const unzipper = new fflate.Unzip();
    unzipper.register(fflate.UnzipInflate);

    unzipper.onfile = (entry) => {
      if (entry.name.includes("messages") && (entry.name.endsWith(".json") || entry.name.endsWith(".csv"))) {
        const textChunks = [];
        const decoder = new TextDecoder("utf-8");

        entry.ondata = (err, chunk, final) => {
          if (err) return;
          textChunks.push(decoder.decode(chunk, { stream: !final }));

          if (final) {
            const rawContent = textChunks.join("");
            try {
              const messages = JSON.parse(rawContent);
              if (Array.isArray(messages)) {
                for (const msg of messages) {
                  const timestamp = msg.Timestamp || msg.timestamp || "";
                  const datePrefix = formatDatePrefix(timestamp);
                  const content = (msg.Contents || msg.content || "") + " " + (msg.Attachments || "");

                  attachmentUrlRegex.lastIndex = 0;
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

            attachmentUrlRegex.lastIndex = 0;
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

export async function openExistingFolder() {
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

    window.switchTab("tabRawBrowser");
    dom.downloadStatusBar.classList.remove("hidden");
    dom.dlStatusTitle.textContent = "Scanning folder...";
    dom.dlStatusDetail.textContent = "Discovering files...";
    dom.dlProgressBar.style.width = "10%";

    clearAllBlobUrls();
    state.allMediaRegistry = [];
    state.rawCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };
    state.folderHandleCache.clear();
    state.hasIndexedDbLoaded = false;

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
        state.activeDb = new state.sqlEngine.Database(new Uint8Array(await f.arrayBuffer()));
        const res = state.activeDb.exec("SELECT image_filename, ocr_text, visual_tags FROM screenshot_search");
        if (res.length) {
          for (const [fname, ocr, tags] of res[0].values) {
            searchMap.set(fname, { ocr: ocr || "", tags: tags || "" });
          }
          state.hasIndexedDbLoaded = true;
        }
      } catch (err) {
        console.warn("Could not query SQLite table", err);
      }
    }

    updateCloudScannerVisibility();

    const dirEntries = [];
    for await (const entry of targetHandle.values()) {
      if (entry.kind === "directory") dirEntries.push(entry);
    }

    let scannedFilesCount = 0;
    const totalDirs = dirEntries.length || 1;

    for (let d = 0; d < dirEntries.length; d++) {
      const handle = dirEntries[d];
      const folderName = handle.name;

      try {
        for await (const fileHandle of handle.values()) {
          if (fileHandle.kind === "file") {
            const fileName = fileHandle.name;
            const ext = fileName.split(".").pop().toLowerCase();
            const cat = getCategory(ext);
            const dbMatch = searchMap.get(fileName) || { ocr: "", tags: "" };

            state.rawCategoryCounts[cat] = (state.rawCategoryCounts[cat] || 0) + 1;

            state.allMediaRegistry.push({
              id: state.allMediaRegistry.length,
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
            if (scannedFilesCount % 150 === 0) {
              const approxProgress = Math.min(88, 15 + Math.floor((d / totalDirs) * 70));
              dom.dlProgressBar.style.width = `${approxProgress}%`;
              dom.dlStatusDetail.textContent = `Reading /${folderName} • Found ${formatNumber(scannedFilesCount)} files...`;
              renderBadgeUI();
            }
          }
        }
      } catch (dirErr) {
        console.warn(`Could not read '${folderName}':`, dirErr);
      }

      const dirProgress = Math.min(90, 15 + Math.floor(((d + 1) / totalDirs) * 75));
      dom.dlProgressBar.style.width = `${dirProgress}%`;
      dom.dlStatusDetail.textContent = `Completed /${folderName} • Found ${formatNumber(scannedFilesCount)} files...`;
    }

    dom.dlProgressBar.style.width = "100%";
    dom.dlStatusTitle.textContent = "Folder Loaded";
    dom.dlStatusDetail.textContent = `Successfully loaded ${formatNumber(state.allMediaRegistry.length)} files.`;
    
    setTimeout(() => { dom.downloadStatusBar.classList.add("hidden"); }, 3000);

    updateTimelineBounds();
    updateAiTimelineBounds();
    renderBadgeUI();
    applyRawFiltersAndPaginate();

    dom.aiIndexStatus.textContent = state.hasIndexedDbLoaded 
      ? `Loaded Local Archive (${formatNumber(state.allMediaRegistry.filter(i => i.visualTags || i.ocrText).length)} items with ${dbSourceName})`
      : `Loaded Local Archive (${formatNumber(state.allMediaRegistry.length)} items - No SQLite database found)`;
  } catch (err) {
    dom.downloadStatusBar.classList.add("hidden");
    if (err.name === "SecurityError") {
      alert("Browser Security Notice: Browsers block selecting root folders (like Downloads or Desktop) directly. Please select a subfolder inside them instead (e.g. Downloads/MyMedia).");
    } else if (err.name !== "AbortError") {
      alert("Could not open folder: " + err.message);
    }
  }
}

export async function loadDemoVault() {
  try {
    await initSql();
    const dbResp = await fetch("demo/screenshots.db");
    if (!dbResp.ok) throw new Error("demo/screenshots.db not found");
    const dbBuf = await dbResp.arrayBuffer();

    state.activeDb = new state.sqlEngine.Database(new Uint8Array(dbBuf));
    const res = state.activeDb.exec("SELECT image_filename, ocr_text, visual_tags FROM screenshot_search");

    if (res.length > 0) {
      state.demoMediaRegistry = [];
      state.aiCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };

      for (const [filename, ocrText, visualTags] of res[0].values) {
        const ext = filename.split(".").pop().toLowerCase();
        const folder = (ext === "png") ? "png" : "jpg";
        const cat = getCategory(ext);
        state.aiCategoryCounts[cat] = (state.aiCategoryCounts[cat] || 0) + 1;

        state.demoMediaRegistry.push({
          id: state.demoMediaRegistry.length,
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
      dom.aiIndexStatus.textContent = `Pre-Loaded Demo Index (${state.demoMediaRegistry.length} items ready)`;
    }
  } catch (err) {
    dom.aiIndexStatus.textContent = "No database loaded. Open an export folder or run GPU scan.";
  }
}

export function setupExtractorEvents() {
  dom.extractorZipInput.addEventListener("change", (e) => {
    if (!e.target.files.length) return;
    state.selectedZipFile = e.target.files[0];
    
    if (state.selectedZipFile.name.toLowerCase() !== "package.zip") {
      dom.selectedZipFilename.textContent = `Selected: ${state.selectedZipFile.name} (Notice: Ensure this is your unedited Discord data package)`;
    } else {
      dom.selectedZipFilename.textContent = `Selected: ${state.selectedZipFile.name} (${(state.selectedZipFile.size / (1024 * 1024)).toFixed(1)} MB)`;
    }
    
    dom.selectedZipFilename.classList.remove("hidden");
    dom.btnStartExportPipeline.disabled = false;
  });

  dom.btnStartExportPipeline.addEventListener("click", async () => {
    if (!state.selectedZipFile) return;

    try {
      const parentDirHandle = await window.showDirectoryPicker({ 
        mode: "readwrite",
        startIn: "downloads"
      });
      state.currentExportDirHandle = await parentDirHandle.getDirectoryHandle("disdump-download", { create: true });
      
      clearAllBlobUrls();
      state.allMediaRegistry = [];
      state.rawCategoryCounts = { image: 0, video: 0, audio: 0, doc: 0, other: 0 };
      state.rawCurrentPage = 1;
      state.folderHandleCache.clear();
      state.isExtractionRunning = true;
      state.hasIndexedDbLoaded = false;

      window.switchTab("tabRawBrowser");

      dom.downloadStatusBar.classList.remove("hidden");
      dom.dlStatusTitle.textContent = "Scanning package.zip message history...";

      const manifest = await extractAllAttachments(state.selectedZipFile);
      const totalFiles = manifest.length;
      dom.dlStatusTitle.textContent = `Downloading & sorting ${formatNumber(totalFiles)} attachments...`;

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
              const subfolder = await getSubfolder(state.currentExportDirHandle, item.ext);
              
              try {
                const fh = await subfolder.getFileHandle(item.filename, { create: true });
                const w = await fh.createWritable();
                await w.write(blob);
                await w.close();
                item.fileHandle = fh;
              } catch (writeErr) {
                console.warn(`File write skipped: ${item.filename}`, writeErr);
              }

              state.rawCategoryCounts[item.category] = (state.rawCategoryCounts[item.category] || 0) + 1;
              state.allMediaRegistry.push(item);
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
            if (now - lastUiUpdate > 200 || processedCount === totalFiles) {
              lastUiUpdate = now;
              const pct = ((processedCount / totalFiles) * 100).toFixed(1);
              dom.dlProgressBar.style.width = `${pct}%`;
              dom.dlStatusDetail.textContent = `${pct}% • ${formatNumber(savedCount)} saved${skippedCount > 0 ? ` (${formatNumber(skippedCount)} expired/deleted)` : ""}`;
              renderBadgeUI();

              if (hasRenderedLiveInitialBatch) {
                state.rawFilteredRegistry = state.allMediaRegistry.filter(m => state.rawSelectedCategories.has(m.category));
                updateRawPaginationUI();
              }
            }
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      state.isExtractionRunning = false;
      
      dom.dlStatusTitle.textContent = "Extraction complete!";
      dom.dlStatusDetail.textContent = `All ${formatNumber(savedCount)} available files downloaded into /disdump-download.`;
      
      renderBadgeUI();
      updateTimelineBounds();
      applyRawFiltersAndPaginate();

      setTimeout(() => {
        openCompletionModal("download");
      }, 600);

    } catch (err) {
      state.isExtractionRunning = false;
      if (err.name === "SecurityError") {
        alert("Browser Security Notice: Browsers block selecting root folders (like Downloads or Desktop) directly. Please open Downloads, create a new folder (e.g. 'MyDiscordMedia'), and select that folder.");
      } else if (err.name !== "AbortError") {
        alert("Export failed: " + err.message);
      }
    }
  });

  dom.btnHeroOpenExisting.addEventListener("click", openExistingFolder);
  if (dom.btnRawOpenFolder) dom.btnRawOpenFolder.addEventListener("click", openExistingFolder);
  if (dom.btnAiOpenFolder) dom.btnAiOpenFolder.addEventListener("click", openExistingFolder);
  if (dom.btnEmptyOpenFolder) dom.btnEmptyOpenFolder.addEventListener("click", openExistingFolder);
}