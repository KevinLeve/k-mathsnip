/**
 * Installs the K-MathSnip MathType add-in (a .dotm global template) into Word's STARTUP
 * folder so Word loads it automatically on every launch. The template binds Ctrl+Shift+M to
 * a macro that converts the selection's/document's native Word equations into real MathType
 * OLE objects, for users who have MathType itself installed and want that literal format
 * instead of (or in addition to) a native Word equation.
 *
 * Windows-only (MathType's Word integration and the .dotm STARTUP mechanism are both
 * Windows/Word-specific); a no-op elsewhere.
 */
import { app } from 'electron';
import { existsSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { join } from 'path';

const ADDIN_FILENAME = 'KMathSnip-MathType.dotm';

function bundledAddinPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'word-addin', ADDIN_FILENAME)
    : join(app.getAppPath(), 'resources', 'word-addin', ADDIN_FILENAME);
}

function wordStartupDirectory(): string {
  return join(app.getPath('appData'), 'Microsoft', 'Word', 'STARTUP');
}

/** Copies the bundled add-in into Word's STARTUP folder if missing or outdated. Never throws -
 * a user without Word installed, or with no write access to that folder, just doesn't get the
 * MathType shortcut; every other K-MathSnip feature is unaffected. */
export function installMathTypeAddin(): void {
  if (process.platform !== 'win32') return;
  try {
    const source = bundledAddinPath();
    if (!existsSync(source)) return;

    const destDir = wordStartupDirectory();
    const dest = join(destDir, ADDIN_FILENAME);
    if (existsSync(dest) && statSync(dest).mtimeMs >= statSync(source).mtimeMs) return;

    mkdirSync(destDir, { recursive: true });
    copyFileSync(source, dest);
  } catch (error) {
    console.warn('Could not install the MathType Word add-in:', error);
  }
}
