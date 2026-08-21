import { state, JUNK_TAGS, PROMPT_BLEED_PATTERNS, MAX_BLOB_CACHE } from "./state.js";
import { dom } from "./dom.js";

export function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num || 0);
}

export function getCategory(ext) {
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

export function normalizeDiscordUrl(url) {
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

export function extractDateFromFilename(filename) {
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

export function formatDatePrefix(timestampStr) {
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

export async function initSql() {
  if (!state.sqlEngine) {
    state.sqlEngine = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
    });
  }
}

export async function getSubfolder(rootDirHandle, ext) {
  const name = ext.toLowerCase();
  if (!state.folderHandleCache.has(name)) {
    const handle = await rootDirHandle.getDirectoryHandle(name, { create: true });
    state.folderHandleCache.set(name, handle);
  }
  return state.folderHandleCache.get(name);
}

export function getSanitizedTagsList(tagsString) {
  if (!tagsString) return [];
  return tagsString
    .split(",")
    .map(t => t.trim().replace(/^[{}\[\]"\'`()]+|[{}\[\]"\'`()]+$/g, ""))
    .filter(t => {
      if (!t || JUNK_TAGS.has(t.toLowerCase()) || t.length > 40) return false;
      return !PROMPT_BLEED_PATTERNS.some(rx => rx.test(t));
    });
}

export async function resolveItemBlob(item) {
  if (item.blobUrl) {
    if (state.blobCache.has(item)) {
      state.blobCache.delete(item);
      state.blobCache.set(item, item.blobUrl);
    }
    return item.blobUrl;
  }
  if (item.fileHandle) {
    try {
      const f = await item.fileHandle.getFile();
      const newUrl = URL.createObjectURL(f);
      item.blobUrl = newUrl;

      state.blobCache.set(item, newUrl);
      if (state.blobCache.size > MAX_BLOB_CACHE) {
        const oldestItem = state.blobCache.keys().next().value;
        const oldestUrl = state.blobCache.get(oldestItem);
        if (oldestUrl && typeof oldestUrl === "string" && oldestUrl.startsWith("blob:")) {
          URL.revokeObjectURL(oldestUrl);
        }
        if (oldestItem) oldestItem.blobUrl = null;
        state.blobCache.delete(oldestItem);
      }
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

export function clearAllBlobUrls() {
  for (const [item, url] of state.blobCache.entries()) {
    if (url && typeof url === "string" && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
    if (item) item.blobUrl = null;
  }
  state.blobCache.clear();
}

export function renderBadgeUI() {
  dom.rawCntImg.textContent = formatNumber(state.rawCategoryCounts.image);
  dom.rawCntVid.textContent = formatNumber(state.rawCategoryCounts.video);
  dom.rawCntAud.textContent = formatNumber(state.rawCategoryCounts.audio);
  dom.rawCntDoc.textContent = formatNumber(state.rawCategoryCounts.doc);
  dom.rawCntOth.textContent = formatNumber(state.rawCategoryCounts.other);

  const activeAiCounts = state.hasIndexedDbLoaded ? state.rawCategoryCounts : state.aiCategoryCounts;
  dom.aiCntImg.textContent = formatNumber(activeAiCounts.image);
  dom.aiCntVid.textContent = formatNumber(activeAiCounts.video);
  dom.aiCntAud.textContent = formatNumber(activeAiCounts.audio);
  dom.aiCntDoc.textContent = formatNumber(activeAiCounts.doc);
  dom.aiCntOth.textContent = formatNumber(activeAiCounts.other);
}