import { state, VPS_BASE_URL, IS_LOCAL_HOST } from "./state.js";
import { dom } from "./dom.js";
import { initSql, renderBadgeUI } from "./utils.js";
import { extractAllAttachments } from "./extractor.js";
import { updateTimelineBounds } from "./raw-browser.js";
import { updateAiTimelineBounds, applyAiFiltersAndPaginate } from "./ai-search.js";
import { openCompletionModal } from "./modals.js";

export function updateCloudScannerVisibility() {
  if (IS_LOCAL_HOST) {
    if (dom.cloudScannerCard) dom.cloudScannerCard.classList.add("hidden");
    if (dom.localHostBanner) dom.localHostBanner.classList.remove("hidden");
    return;
  }

  if (dom.localHostBanner) dom.localHostBanner.classList.add("hidden");
  if (dom.cloudScannerCard) {
    if (state.hasIndexedDbLoaded) {
      dom.cloudScannerCard.classList.add("hidden");
    } else {
      dom.cloudScannerCard.classList.remove("hidden");
    }
  }
}

export function setupCloudScannerEvents() {
  if (dom.cloudZipInput) {
    dom.cloudZipInput.addEventListener("change", (e) => {
      if (!e.target.files.length) return;
      state.selectedCloudZip = e.target.files[0];
      dom.lblCloudZip.classList.add("hidden");
      dom.btnStartCloudScan.classList.remove("hidden");
      dom.aiIndexStatus.textContent = `Selected ${state.selectedCloudZip.name}. Step 2: Pick your 'disdump-download' folder to save demo.db & load labels.`;
    });
  }

  if (dom.btnStartCloudScan) {
    dom.btnStartCloudScan.addEventListener("click", async () => {
      if (!state.selectedCloudZip) return;

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

        dom.btnStartCloudScan.classList.add("hidden");
        dom.lblCloudZip.classList.remove("hidden");

        dom.downloadStatusBar.classList.remove("hidden");
        dom.dlStatusTitle.textContent = "Scanning package.zip for images...";
        dom.dlStatusDetail.textContent = "Filtering first 100 images...";
        dom.dlProgressBar.style.width = "10%";

        dom.aiIndexStatus.textContent = "Parsing first 100 image attachments...";
        const rawExtracted = await extractAllAttachments(state.selectedCloudZip);
        const imageManifest = rawExtracted.filter(m => m.category === "image").slice(0, 100);

        if (!imageManifest.length) {
          dom.aiIndexStatus.textContent = "No image attachments found in package.zip.";
          dom.downloadStatusBar.classList.add("hidden");
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

        dom.dlStatusTitle.textContent = "Submitting to GPU Cloud Queue...";
        dom.dlStatusDetail.textContent = `Queuing ${imageManifest.length} images...`;
        dom.dlProgressBar.style.width = "25%";
        dom.aiIndexStatus.textContent = `Submitting ${imageManifest.length} images to Cloud GPU Queue...`;

        const queueResp = await fetch(`${VPS_BASE_URL}/api/queue-job`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: imageManifest.map(m => ({ filename: m.filename, url: m.url })) })
        });
        
        if (!queueResp.ok) {
          const errData = await queueResp.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned HTTP ${queueResp.status}`);
        }
        
        const { job_id } = await queueResp.json();
        state.activeCloudJobId = job_id;
        state.isCloudScanningRunning = true;
        let processingTimer = 0;
        let pollFailureCount = 0;
        const MAX_POLL_FAILURES = 5;

        const poll = setInterval(async () => {
          try {
            const statusResp = await fetch(`${VPS_BASE_URL}/api/job-status/${job_id}`);
            
            if (!statusResp.ok) {
              pollFailureCount++;
              if (statusResp.status === 404 || pollFailureCount >= MAX_POLL_FAILURES) {
                clearInterval(poll);
                state.isCloudScanningRunning = false;
                state.activeCloudJobId = null;
                dom.downloadStatusBar.classList.add("hidden");
                dom.aiIndexStatus.textContent = statusResp.status === 404
                  ? "Error: Cloud scan job expired or was reset by server."
                  : `Error: Server connection failed (HTTP ${statusResp.status}).`;
              }
              return;
            }

            pollFailureCount = 0;
            const st = await statusResp.json();
            
            if (st.status === "queued") {
              const posText = st.position ? `#${st.position}` : "Next in line";
              dom.dlStatusTitle.textContent = "⏳ Queued for GPU Processing...";
              dom.dlStatusDetail.textContent = `Queue Position: ${posText} • Waiting for GPU turn...`;
              dom.dlProgressBar.style.width = "30%";
              dom.aiIndexStatus.textContent = `Queue Position: ${posText} • Waiting for GPU turn...`;
            }

            if (st.status === "processing") {
              processingTimer += 2.5;
              const dynamicProgress = Math.min(88, 35 + Math.floor(processingTimer * 0.6));
              dom.dlStatusTitle.textContent = "⚡ GPU Active: Labelling with Qwen2.5-VL...";
              dom.dlStatusDetail.textContent = `Labelling ${imageManifest.length} images on NVIDIA L4 GPU (${Math.floor(processingTimer)}s elapsed)...`;
              dom.dlProgressBar.style.width = `${dynamicProgress}%`;
              dom.aiIndexStatus.textContent = `GPU Active: Labelling ${imageManifest.length} images with Qwen2.5-VL...`;
            }

            if (st.status === "completed") {
              clearInterval(poll);
              state.isCloudScanningRunning = false;
              state.activeCloudJobId = null;

              dom.dlStatusTitle.textContent = "Saving Demo Database...";
              dom.dlStatusDetail.textContent = "Writing demo.db to folder...";
              dom.dlProgressBar.style.width = "95%";
              dom.aiIndexStatus.textContent = "Saving demo.db to folder...";

              const dbResp = await fetch(`${VPS_BASE_URL}/api/download/${job_id}`);
              if (!dbResp.ok) throw new Error(`Download failed: HTTP ${dbResp.status}`);
              const dbBuf = await dbResp.arrayBuffer();

              const dbFile = await targetHandle.getFileHandle("demo.db", { create: true });
              const wr = await dbFile.createWritable();
              await wr.write(dbBuf);
              await wr.close();

              await initSql();
              state.activeDb = new state.sqlEngine.Database(new Uint8Array(dbBuf));
              state.hasIndexedDbLoaded = true;
              updateCloudScannerVisibility();
              
              let searchMap = new Map();
              try {
                const res = state.activeDb.exec("SELECT image_filename, ocr_text, visual_tags FROM screenshot_search");
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

              state.allMediaRegistry = imageManifest;
              state.rawCategoryCounts = { image: imageManifest.length, video: 0, audio: 0, doc: 0, other: 0 };
              
              updateTimelineBounds();
              updateAiTimelineBounds();
              renderBadgeUI();

              dom.dlProgressBar.style.width = "100%";
              dom.dlStatusTitle.textContent = "Labelling Complete!";
              dom.dlStatusDetail.textContent = `Successfully saved demo.db and indexed ${imageManifest.length} images.`;
              dom.aiIndexStatus.textContent = `Active Cloud Demo Index (${imageManifest.length} images indexed)`;
              
              setTimeout(() => { dom.downloadStatusBar.classList.add("hidden"); }, 4000);
              applyAiFiltersAndPaginate();

              setTimeout(() => {
                openCompletionModal("demo");
              }, 600);
            }

            if (st.status === "failed") {
              clearInterval(poll);
              state.isCloudScanningRunning = false;
              state.activeCloudJobId = null;
              dom.downloadStatusBar.classList.add("hidden");
              dom.aiIndexStatus.textContent = `Error: ${st.error || "Processing failed"}`;
            }
          } catch (pollErr) {
            pollFailureCount++;
            console.warn("Status poll error:", pollErr);
            if (pollFailureCount >= MAX_POLL_FAILURES) {
              clearInterval(poll);
              state.isCloudScanningRunning = false;
              state.activeCloudJobId = null;
              dom.downloadStatusBar.classList.add("hidden");
              dom.aiIndexStatus.textContent = "Error: Lost connection to GPU scan service.";
            }
          }
        }, 2500);

      } catch (err) {
        state.isCloudScanningRunning = false;
        state.activeCloudJobId = null;
        dom.downloadStatusBar.classList.add("hidden");
        if (err.name === "SecurityError") {
          alert("Browser Security Notice: Browsers block selecting root folders (like Downloads or Desktop) directly. Please select a subfolder inside them instead (e.g. Downloads/MyMedia).");
        } else if (err.name !== "AbortError") {
          dom.aiIndexStatus.textContent = "Error: " + err.message;
        }
      }
    });
  }
}