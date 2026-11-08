import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSettingsUpdates } from '../src/shared/settings';
import { saveWithShortcut } from '../src/main/shortcuts';

test('settings normalize a local model path and history limit', () => {
  assert.deepEqual(
    validateSettingsUpdates({
      mfrModelPath: '/models/mfr-1.5',
      historyLimit: 10,
    }),
    { mfrModelPath: '/models/mfr-1.5', historyLimit: 10 },
  );
});

test('invalid settings cannot cross the IPC boundary', () => {
  for (const updates of [
    null,
    [],
    { mfrModelPath: 'bad\0path' },
    { historyLimit: 0 },
    { historyLimit: 501 },
    { historyLimit: NaN },
    { historyLimit: 10.5 },
    { theme: 'invalid' },
    { language: 'fr' },
    { defaultOutputFormat: 'image' },
    { snipHotkey: ' ' },
    { ocrEngine: 'mfr' },
  ]) {
    assert.throws(() => validateSettingsUpdates(updates));
  }
});

function registry(accept = true) {
  const registered = new Set(['Control+Shift+S']);
  return {
    registered,
    register: (key: string) => {
      if (accept) registered.add(key);
      return accept;
    },
    unregister: (key: string) => {
      registered.delete(key);
    },
    isRegistered: (key: string) => registered.has(key),
  };
}

test('a conflicting shortcut leaves the previous shortcut and persisted settings intact', () => {
  const shortcuts = registry(false);
  let saved = false;
  assert.throws(
    () =>
      saveWithShortcut(
        'Control+Shift+S',
        'Control+Shift+D',
        shortcuts,
        () => {},
        () => {
          saved = true;
        },
      ),
    /unavailable/,
  );
  assert.equal(saved, false);
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+S']);
});

test('failed persistence releases the new shortcut without losing the old one', () => {
  const shortcuts = registry();
  assert.throws(
    () =>
      saveWithShortcut(
        'Control+Shift+S',
        'Control+Shift+D',
        shortcuts,
        () => {},
        () => {
          throw new Error('disk full');
        },
      ),
    /disk full/,
  );
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+S']);
});

test('saving a new shortcut immediately replaces the old shortcut', () => {
  const shortcuts = registry();
  let saved = false;
  saveWithShortcut(
    'Control+Shift+S',
    'Control+Shift+D',
    shortcuts,
    () => {},
    () => {
      saved = true;
    },
  );
  assert.equal(saved, true);
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+D']);
});

test('saving retries a shortcut whose startup registration failed', () => {
  const shortcuts = registry();
  shortcuts.registered.clear();
  saveWithShortcut(
    'Control+Shift+S',
    'Control+Shift+S',
    shortcuts,
    () => {},
    () => {},
  );
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+S']);
});
