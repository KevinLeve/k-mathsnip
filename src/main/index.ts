import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  dialog,
} from 'electron';
import path from 'path';
import { getSettings, setSettings } from './store';
import { IPC, type AppSettings } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';
import { saveWithShortcut } from './shortcuts';
import { initDb } from './db';
import { registerIpcHandlers } from './ipc';
import { startSnip } from './capture';
import { disposeMfr, getMfrStatus, prepareMfrModel, prepareClearMfrModel } from './mfr';
import { createSettingsService } from './settings-service';
import { createWindowCloseHandler } from './window-close';
import { checkForUpdatesQuietly } from './updater';
import {
  createApplicationMenuTemplate,
  createCloseDialogOptions,
  createTrayMenuTemplate,
  getNativeText,
} from './native-menus';

// Ensure only one instance runs at a time
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let updateSettings: ((updates: Partial<AppSettings>) => Promise<AppSettings>) | undefined;
let menuLanguage: AppSettings['language'] | undefined;

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.on('second-instance', showMainWindow);

function getIconPath(): string {
  // In production, icon is in build/ relative to the app root (resources/app.asar)
  // electron-builder copies buildResources into the package
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(__dirname, '../../build/icon.png');
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 480,
    minHeight: 400,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => win.show());

  win.on(
    'close',
    createWindowCloseHandler({
      isQuitting: () => isQuitting,
      isDestroyed: () => win.isDestroyed(),
      ask: async () => {
        const { response } = await dialog.showMessageBox(
          win,
          createCloseDialogOptions(getSettings().language),
        );
        return response === 0 ? 'minimize' : response === 1 ? 'quit' : 'cancel';
      },
      minimize: () => win.minimize(),
      quit: () => app.quit(),
      onError: (error) => console.warn('Could not show the close dialog:', error),
    }),
  );

  return win;
}

function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('K-MathSnip');

  tray.on('click', showMainWindow);
}

function refreshNativeMenus(): void {
  const language = getSettings().language;
  const actions = {
    changeLanguage: (next: AppSettings['language']) => {
      // Native radio items toggle before their callback. Restore the saved value
      // until the settings transaction has succeeded, including on write failure.
      refreshNativeMenus();
      void updateSettings?.({ language: next }).catch(() => {
        refreshNativeMenus();
        const text = getNativeText(getSettings().language);
        if (!mainWindow || mainWindow.isDestroyed() || isQuitting) return;
        void dialog
          .showMessageBox(mainWindow, {
            type: 'error',
            title: 'K-MathSnip',
            message: text.languageFailed,
            detail: text.languageFailedDetail,
          })
          .catch(() => {});
      });
    },
    snip: triggerSnip,
    open: showMainWindow,
    settings: () => {
      showMainWindow();
      mainWindow?.webContents.send(IPC.NAVIGATE, 'settings');
    },
    close: () => mainWindow?.close(),
    quit: () => app.quit(),
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      createApplicationMenuTemplate(language, process.platform, actions, app.isPackaged),
    ),
  );
  tray?.setContextMenu(Menu.buildFromTemplate(createTrayMenuTemplate(language, actions)));
  menuLanguage = language;
}

function triggerSnip(): void {
  if (mainWindow) void startSnip(mainWindow);
}

function registerGlobalShortcut(): void {
  const settings = getSettings();
  try {
    if (!globalShortcut.register(settings.snipHotkey, triggerSnip)) {
      console.warn('Snip hotkey unavailable:', settings.snipHotkey);
    }
  } catch (error) {
    console.warn('Could not register snip hotkey:', error);
  }
}

function applyTheme(): void {
  const settings = getSettings();
  if (settings.theme === 'system') {
    nativeTheme.themeSource = 'system';
  } else {
    nativeTheme.themeSource = settings.theme;
  }
}

app.whenReady().then(() => {
  initDb();
  mainWindow = createMainWindow();
  const settingsService = createSettingsService({
    read: getSettings,
    persist: (input) => {
      const updates = validateSettingsUpdates(input);
      const previous = getSettings();
      const previousTheme = nativeTheme.themeSource;
      try {
        if (updates.theme !== undefined) nativeTheme.themeSource = updates.theme;
        if (updates.snipHotkey !== undefined) {
          saveWithShortcut(
            previous.snipHotkey,
            updates.snipHotkey,
            globalShortcut,
            triggerSnip,
            () => setSettings(updates),
          );
        } else {
          // An unavailable startup shortcut must not block unrelated settings changes.
          setSettings(updates);
        }
      } catch (error) {
        nativeTheme.themeSource = previousTheme;
        throw error;
      }
    },
    prepareModel: prepareMfrModel,
    prepareClearModel: prepareClearMfrModel,
    changed: (settings) => {
      if (settings.language !== menuLanguage) {
        try {
          refreshNativeMenus();
        } catch (error) {
          // The saved setting remains authoritative if menus disappear during shutdown.
          console.warn('Could not refresh application menus:', error);
        }
      }
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed()) win.webContents.send(IPC.SETTINGS_CHANGED, settings);
        } catch {
          // A closing renderer must not turn a successful commit into a failed update.
        }
      }
    },
  });
  updateSettings = settingsService.update;
  registerIpcHandlers(mainWindow, settingsService.update, settingsService.clearModel);
  createTray();
  refreshNativeMenus();
  registerGlobalShortcut();
  applyTheme();
  checkForUpdatesQuietly();
  // Warm the bundled/saved model's status cache so the first Settings/Snip screen doesn't show
  // a transient "checking" state.
  void getMfrStatus().catch(() => {
    // Model status carries a user-facing error; the Settings page surfaces it from there.
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
});

app.on('activate', showMainWindow);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  isQuitting = true;
  disposeMfr();
});
