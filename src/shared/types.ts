// IPC channel names
export const IPC = {
  START_SNIP: 'snip:start',
  SNIP_CAPTURED: 'snip:captured',
  SNIP_ERROR: 'snip:error',
  NAVIGATE: 'app:navigate',
  OVERLAY_SCREEN_DATA: 'overlay:screen-data',
  OVERLAY_SELECTION: 'overlay:selection',
  OVERLAY_CANCEL: 'overlay:cancel',
  OVERLAY_READY: 'overlay:ready',

  RECOGNIZE: 'ocr:recognize',
  MFR_GET_STATUS: 'mfr:status:get',
  MFR_DOWNLOAD: 'mfr:download',
  MFR_SELECT: 'mfr:select',
  MFR_CLEAR: 'mfr:clear',
  MFR_OPEN_MODEL_PAGE: 'mfr:open-model-page',
  MFR_STATUS: 'mfr:status',

  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',

  GET_HISTORY: 'history:get',
  DELETE_HISTORY_ITEM: 'history:delete',
  CLEAR_HISTORY: 'history:clear',
  SEARCH_HISTORY: 'history:search',

  PASTE_IMAGE: 'clipboard:paste-image',
  COPY_FOR_WORD: 'clipboard:copy-for-word',
  COPY_FOR_MATHTYPE: 'clipboard:copy-for-mathtype',

  CHECK_FOR_UPDATES: 'update:check',
} as const;

export type OutputFormat = 'latex' | 'markdown' | 'text';
export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'zh-CN';

export interface MfrStatus {
  state:
    | 'not-downloaded'
    | 'downloading'
    | 'validating'
    | 'loading'
    | 'clearing'
    | 'ready'
    | 'error';
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  modelPath?: string;
  /** True when modelPath is the model bundled with the install (not a download/user-selected
   * folder) — the Settings UI uses this to skip the download/select/clear controls entirely,
   * since there's nothing to download, select, or clear for a model that ships in the app. */
  isBundled?: boolean;
}

export interface AppSettings {
  /** Empty uses the bundled/managed model directory; otherwise a verified local directory. */
  mfrModelPath: string;
  snipHotkey: string;
  defaultOutputFormat: OutputFormat;
  historyLimit: number;
  theme: Theme;
  language: Language;
}

export interface OCRResult {
  latex: string;
  markdown: string;
  text: string;
  rawResponse: unknown;
  warning?: string;
}

export interface HistoryItem {
  id: number;
  timestamp: string;
  pipeline: 'MFR-1.5';
  imageThumbnail: string;
  resultLatex: string;
  resultMarkdown: string;
  resultText: string;
}

export interface ScreenCapture {
  dataUrl: string;
  bounds: { x: number; y: number; width: number; height: number };
  displayId: string;
}

export interface SnipSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}
