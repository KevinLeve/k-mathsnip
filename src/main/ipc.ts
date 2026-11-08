import { ipcMain, clipboard, BrowserWindow, dialog, shell } from 'electron';
import { IPC } from '../shared/types';
import type { AppSettings } from '../shared/types';
import { getSettings } from './store';
import {
  addHistoryItem,
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  trimHistory,
} from './db';
import { startSnip, createThumbnail } from './capture';
import { downloadMfrModel, getMfrStatus, recognizeMfr } from './mfr';
import { MFR_REVISION } from '../services/mfr-model';
import { latexToMathml, LatexParseError } from './latex-to-mathml';
import { checkForUpdates } from './updater';

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  saveSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>,
  clearModel: () => Promise<AppSettings>,
): void {
  let modelOperation = false;
  async function changeModel<T>(operation: () => Promise<T>): Promise<T> {
    if (modelOperation) throw new Error('A model operation is in progress. Please wait.');
    modelOperation = true;
    try {
      return await operation();
    } finally {
      modelOperation = false;
    }
  }
  ipcMain.handle(IPC.START_SNIP, () => startSnip(mainWindow));

  ipcMain.handle(IPC.RECOGNIZE, async (_event, imageBase64: string) => {
    const settings = getSettings();
    const result = await recognizeMfr(imageBase64);

    // Persistence is secondary: a disk/thumbnail error must not discard OCR output.
    try {
      const thumbnail = createThumbnail(imageBase64);
      addHistoryItem('MFR-1.5', thumbnail, result.latex, result.markdown, result.text);
      trimHistory(settings.historyLimit);
    } catch {
      return { ...result, warning: 'Could not update recognition history.' };
    }

    return result;
  });

  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());
  ipcMain.handle(IPC.MFR_GET_STATUS, getMfrStatus);
  ipcMain.handle(IPC.MFR_DOWNLOAD, () =>
    changeModel(async () => {
      await downloadMfrModel();
      return saveSettings({ mfrModelPath: '' });
    }),
  );
  ipcMain.handle(IPC.MFR_SELECT, () =>
    changeModel(async () => {
      const selected = await dialog.showOpenDialog(mainWindow, {
        title:
          getSettings().language === 'zh-CN'
            ? '选择本地 MFR-1.5 模型'
            : 'Select Local MFR-1.5 Model',
        properties: ['openDirectory'],
        buttonLabel: getSettings().language === 'zh-CN' ? '选择模型' : 'Select Model',
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      return saveSettings({ mfrModelPath: selected.filePaths[0] });
    }),
  );
  ipcMain.handle(IPC.MFR_CLEAR, () =>
    changeModel(async () => {
      const chinese = getSettings().language === 'zh-CN';
      const answer = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: chinese ? '清理模型缓存' : 'Clear Model Cache',
        message: chinese ? '清理本地模型缓存？' : 'Clear the local model cache?',
        detail: chinese
          ? '应用缓存目录中的模型文件将被删除，当前本地模型会停用。手动选择的外部模型目录及其文件不会删除。之后可重新下载或选择模型。'
          : 'Model files in the application cache will be removed and the current local model will be deactivated. External model folders you selected will not be deleted. You can download or select a model again afterwards.',
        buttons: chinese ? ['清理模型缓存', '取消'] : ['Clear Model Cache', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (answer.response !== 0) return null;
      return clearModel();
    }),
  );
  ipcMain.handle(IPC.MFR_OPEN_MODEL_PAGE, () =>
    shell.openExternal(`https://huggingface.co/breezedeus/pix2text-mfr-1.5/tree/${MFR_REVISION}`),
  );

  ipcMain.handle(IPC.SET_SETTINGS, (_event, updates: Partial<AppSettings>) => {
    return saveSettings(updates);
  });

  ipcMain.handle(IPC.GET_HISTORY, (_event, limit?: number, offset?: number) =>
    getHistory(limit, offset),
  );

  ipcMain.handle(IPC.SEARCH_HISTORY, (_event, query: string) => searchHistory(query));

  ipcMain.handle(IPC.DELETE_HISTORY_ITEM, (_event, id: number) => deleteHistoryItem(id));

  ipcMain.handle(IPC.CLEAR_HISTORY, () => clearHistory());

  ipcMain.handle(IPC.PASTE_IMAGE, () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toPNG().toString('base64');
  });

  ipcMain.handle(IPC.COPY_FOR_WORD, (_event, latex: string): { ok: true } | { ok: false; reason: string } => {
    // Word reads a real, editable equation from the clipboard under the registered format name
    // "MathML Presentation" — verified against actual Word 2026-11-07 (copying a native equation
    // from Word puts MathML on the clipboard under this same name; writing it back and pasting
    // creates a real OMath object). No plain-text fallback is set alongside it: Electron's
    // clipboard.writeBuffer and clipboard.write are each their own atomic open/write/close
    // transaction (unlike the Win32 API, which allows several SetClipboardData calls in one
    // open/close session), so a second call here would silently wipe the MathML we just wrote
    // rather than add to it. Plain-text copy is already covered by the separate LaTeX/Markdown
    // buttons.
    try {
      const mathml = latexToMathml(latex);
      clipboard.writeBuffer('MathML Presentation', Buffer.from(mathml, 'utf-8'));
      return { ok: true };
    } catch (e) {
      if (e instanceof LatexParseError) return { ok: false, reason: e.message };
      throw e;
    }
  });

  ipcMain.handle(IPC.CHECK_FOR_UPDATES, () => checkForUpdates());
}
