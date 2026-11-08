import Store from 'electron-store';
import type { AppSettings } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';

const defaults = {
  mfrModelPath: '',
  snipHotkey: 'CommandOrControl+Shift+S',
  defaultOutputFormat: 'latex' as const,
  historyLimit: 100,
  theme: 'system' as const,
  language: 'en' as const,
};

type StoredSettings = AppSettings;
const store = new Store<StoredSettings>({ defaults });

export function getSettings(): AppSettings {
  return {
    mfrModelPath: store.get('mfrModelPath', ''),
    snipHotkey: store.get('snipHotkey') as string,
    defaultOutputFormat: store.get('defaultOutputFormat') as AppSettings['defaultOutputFormat'],
    historyLimit: store.get('historyLimit') as number,
    theme: store.get('theme') as AppSettings['theme'],
    language: store.get('language', 'en'),
  };
}

export function setSettings(updates: Partial<AppSettings>): void {
  const values = validateSettingsUpdates(updates);
  store.set(values);
}
