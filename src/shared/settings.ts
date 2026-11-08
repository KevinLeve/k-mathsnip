import type { AppSettings } from './types';

/** Validate at the IPC boundary as well as in the settings form. */
export function validateSettingsUpdates(input: unknown): Partial<AppSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid settings.');
  }
  const updates: Partial<AppSettings> = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case 'mfrModelPath':
        if (typeof value !== 'string' || value.includes('\0')) {
          throw new Error('Local model directory must be a valid path.');
        }
        updates.mfrModelPath = value;
        break;
      case 'snipHotkey':
        if (typeof value !== 'string' || !value.trim())
          throw new Error('Snip Hotkey cannot be empty.');
        updates.snipHotkey = value.trim();
        break;
      case 'defaultOutputFormat':
        if (!['latex', 'markdown', 'text'].includes(value as string))
          throw new Error('Unsupported output format.');
        updates.defaultOutputFormat = value as AppSettings['defaultOutputFormat'];
        break;
      case 'theme':
        if (!['light', 'dark', 'system'].includes(value as string))
          throw new Error('Unsupported theme.');
        updates.theme = value as AppSettings['theme'];
        break;
      case 'language':
        if (value !== 'en' && value !== 'zh-CN') throw new Error('Unsupported language.');
        updates.language = value;
        break;
      case 'historyLimit':
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 10 || value > 500) {
          throw new Error('History Limit must be a whole number between 10 and 500.');
        }
        updates.historyLimit = value;
        break;
      default:
        throw new Error(`Unknown setting: ${key}`);
    }
  }
  return updates;
}
