export const VPS_BASE_URL = "";
export const ITEMS_PER_PAGE = 100;
export const MAX_BLOB_CACHE = 250;

export const IS_LOCAL_HOST = ["localhost", "127.0.0.1", "", "::1"].includes(window.location.hostname);

export const JUNK_TAGS = new Set([
  "none", "unknown", "n/a", "null", "undefined", "other",
  "image", "photo", "screenshot", "real life photo"
]);

export const PROMPT_BLEED_PATTERNS = [
  /or category/i,
  /\(e\.g\..*?\)/i,
  /e\.g\./i,
  /specific video game/i,
  /video game title/i,
  /minecraft, valorant/i,
  /discord chat, code/i
];

export const state = {
  sqlEngine: null,
  activeDb: null,
  hasIndexedDbLoaded: false,
  currentExportDirHandle: null,
  isExtractionRunning: false,
  isCloudScanningRunning: false,
  activeCloudJobId: null,
  hasShownLabelDemoModal: false,

  allMediaRegistry: [],
  demoMediaRegistry: [],
  rawFilteredRegistry: [],
  aiFilteredRegistry: [],

  rawCategoryCounts: { image: 0, video: 0, audio: 0, doc: 0, other: 0 },
  aiCategoryCounts: { image: 0, video: 0, audio: 0, doc: 0, other: 0 },

  rawSelectedCategories: new Set(["image", "video"]),
  aiSelectedCategories: new Set(["image", "video"]),

  rawSortOrder: "newest",
  aiSortOrder: "newest",

  rawCurrentPage: 1,
  aiCurrentPage: 1,
  aiSearchQuery: "",

  timelineMinDate: "2018-01-01",
  timelineMaxDate: "2026-12-31",
  rawFilterStartDate: null,
  rawFilterEndDate: null,

  aiTimelineMinDate: "2018-01-01",
  aiTimelineMaxDate: "2026-12-31",
  aiFilterStartDate: null,
  aiFilterEndDate: null,

  selectedZipFile: null,
  selectedCloudZip: null,
  folderHandleCache: new Map(),
  blobCache: new Map(),

  // Lightbox State
  currentLightboxList: [],
  currentLightboxIndex: -1,
  currentLightboxShowTags: false,
  zoomScale: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  startDragX: 0,
  startDragY: 0
};