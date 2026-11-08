/**
 * Auto-update via electron-updater against GitHub Releases (free — no update server needed; see
 * electron-builder.yml `publish`). A release becomes available to users the moment a build is
 * published as a GitHub Release for this repo; nothing else has to be stood up or paid for.
 *
 * Behaviour:
 *  - Checked once automatically a few seconds after startup (quiet — shows nothing if already
 *    up to date, so this never interrupts someone who isn't looking for it).
 *  - Checked on demand via the "Check for Updates" button (Settings), which always reports back,
 *    including "you're up to date" and "could not check" — a manual check should never go silent.
 *  - On finding a newer version, downloads it and then prompts to restart and install. Declining
 *    just means the update installs next time the app quits, same as most desktop apps.
 *  - No-op for a dev run (`app.isPackaged` is false) and for the unpackaged/portable build, where
 *    electron-updater has nothing to update in place.
 */

import { app, dialog, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function mainWin(): BrowserWindow | undefined {
  const [win] = BrowserWindow.getAllWindows();
  return win && !win.isDestroyed() ? win : undefined;
}

async function promptAndDownload(version: string): Promise<void> {
  const win = mainWin();
  const { response } = await dialog.showMessageBox(win ?? ({} as BrowserWindow), {
    type: 'info',
    title: 'Update available',
    message: `K-MathSnip ${version} is available (you have ${app.getVersion()}).`,
    detail: 'Download it now? It will install the next time you restart K-MathSnip.',
    buttons: ['Download', 'Not now'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  await autoUpdater.downloadUpdate().catch((error) => {
    void dialog.showMessageBox(win ?? ({} as BrowserWindow), {
      type: 'error',
      title: 'Update failed',
      message: 'Could not download the update.',
      detail: error instanceof Error ? error.message : String(error),
    });
  });
}

autoUpdater.on('update-downloaded', (info) => {
  const win = mainWin();
  void dialog
    .showMessageBox(win ?? ({} as BrowserWindow), {
      type: 'info',
      title: 'Update ready',
      message: `K-MathSnip ${info.version} is downloaded and ready to install.`,
      detail: 'Restart now to apply it, or it will install automatically on the next quit.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
});

export interface CheckResult {
  state: 'update-available' | 'up-to-date' | 'error';
  version?: string;
  error?: string;
}

/** Manual check — always resolves with a result the UI can show, success or failure. */
export async function checkForUpdates(): Promise<CheckResult> {
  if (!app.isPackaged) return { state: 'up-to-date', version: app.getVersion() };
  try {
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo.version;
    if (version && version !== app.getVersion()) {
      await promptAndDownload(version);
      return { state: 'update-available', version };
    }
    return { state: 'up-to-date', version: app.getVersion() };
  } catch (error) {
    return { state: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

/** Quiet startup check: says nothing if already current, only prompts if a real update exists. */
export function checkForUpdatesQuietly(): void {
  if (!app.isPackaged) return;
  setTimeout(() => {
    void checkForUpdates().catch(() => {
      // A quiet background check failing is not worth surfacing; the manual button reports errors.
    });
  }, 5000);
}
