import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSettingsService, type PreparedModel } from '../src/main/settings-service';
import type { AppSettings } from '../src/shared/types';

const defaults: AppSettings = {
  mfrModelPath: '',
  snipHotkey: 'Control+Shift+S',
  defaultOutputFormat: 'latex',
  historyLimit: 100,
  theme: 'system',
  language: 'en',
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function setup(overrides: Partial<Parameters<typeof createSettingsService>[0]> = {}) {
  let saved = { ...defaults };
  const events: string[] = [];
  const deps: Parameters<typeof createSettingsService>[0] = {
    read: () => ({ ...saved }),
    persist: (updates) => {
      events.push('persist');
      saved = { ...saved, ...updates };
    },
    prepareModel: async () => {
      events.push('prepare');
      return {
        commit: () => events.push('commit'),
        dispose: () => events.push('dispose'),
      };
    },
    changed: () => events.push('changed'),
    ...overrides,
  };
  return { ...createSettingsService(deps), read: deps.read, events };
}

test('failed model validation retains the active model path', async () => {
  const service = setup({
    prepareModel: async () => {
      throw new Error('Missing encoder_model.onnx');
    },
  });
  await assert.rejects(service.update({ mfrModelPath: '/broken/model' }), /Missing/);
  assert.deepEqual(service.read(), defaults);
  assert.deepEqual(service.events, []);
});

test('a verified model is committed only after settings persistence succeeds', async () => {
  const service = setup();
  const saved = await service.update({ mfrModelPath: '/models/Formula Model' });
  assert.equal(saved.mfrModelPath, '/models/Formula Model');
  assert.deepEqual(service.events, ['prepare', 'persist', 'commit', 'changed', 'dispose']);

  const failing = setup({
    persist: () => {
      throw new Error('disk full');
    },
  });
  await assert.rejects(failing.update({ mfrModelPath: '/new/model' }), /disk full/);
  assert.deepEqual(failing.events, ['prepare', 'dispose']);
  assert.equal(failing.read().mfrModelPath, '');
});

test('model-path updates are serialized and a rejected update does not poison the queue', async () => {
  const entered = deferred();
  const finish = deferred();
  const paths: (string | undefined)[] = [];
  const service = setup({
    prepareModel: async (directory): Promise<PreparedModel> => {
      paths.push(directory);
      if (directory === '/bad') {
        entered.resolve();
        await finish.promise;
        throw new Error('Invalid model');
      }
      return { commit() {}, dispose() {} };
    },
  });
  const failed = assert.rejects(service.update({ mfrModelPath: '/bad' }), /Invalid model/);
  await entered.promise;
  const good = service.update({ mfrModelPath: '/good' });
  assert.deepEqual(paths, ['/bad']);
  finish.resolve();
  await failed;
  await good;
  assert.deepEqual(paths, ['/bad', '/good']);
  assert.equal(service.read().mfrModelPath, '/good');
});

test('selecting the managed model prepares the default directory even after a custom model', async () => {
  const paths: (string | undefined)[] = [];
  const service = setup({
    prepareModel: async (directory) => {
      paths.push(directory);
      return { commit() {}, dispose() {} };
    },
  });
  await service.update({ mfrModelPath: '/custom/model' });
  await service.update({ mfrModelPath: '' });
  assert.deepEqual(paths, ['/custom/model', undefined]);
});

test('invalid preference input is rejected without changing persisted settings', async () => {
  const service = setup();
  for (const value of [0, 501, NaN, 10.5]) {
    await assert.rejects(service.update({ historyLimit: value }), /History Limit/);
  }
  assert.deepEqual(service.read(), defaults);
  assert.deepEqual(service.events, []);
});

test('language applies independently of model-path changes', async () => {
  const service = setup();
  await service.update({ language: 'zh-CN' });
  assert.equal(service.read().language, 'zh-CN');
  assert.deepEqual(service.events, ['persist', 'changed']);
  await assert.rejects(service.update({ language: 'unknown' }), /Unsupported language/);
  assert.equal(service.read().language, 'zh-CN');
});

test('clearing the model resets its path without initializing a missing model', async () => {
  const events: string[] = [];
  const service = setup({
    prepareClearModel: async () => ({
      commit: async () => {
        events.push('clear');
      },
      dispose: async () => {
        events.push('dispose');
      },
    }),
  });
  await service.update({ mfrModelPath: '/external/model' });
  service.events.length = 0;
  await service.clearModel();
  assert.equal(service.read().mfrModelPath, '');
  assert.deepEqual(service.events, ['persist', 'changed']);
  assert.deepEqual(events, ['clear', 'dispose']);
});

test('failed persistence rolls back the staged cache without committing its deletion', async () => {
  const events: string[] = [];
  const service = setup({
    persist: () => {
      throw new Error('disk full');
    },
    prepareClearModel: async () => ({
      commit: async () => {
        events.push('clear');
      },
      dispose: async () => {
        events.push('restore');
      },
    }),
  });
  await assert.rejects(service.clearModel(), /disk full/);
  assert.deepEqual(events, ['restore']);
  assert.deepEqual(service.events, []);
});

test('a cleanup failure cannot reactivate a partially deleted model and broadcasts the reset', async () => {
  const service = setup({
    prepareClearModel: async () => ({
      commit: async () => {
        throw new Error('Could not remove remaining cache files');
      },
      dispose: async () => {},
    }),
  });
  await service.update({ mfrModelPath: '/external/model' });
  service.events.length = 0;
  await assert.rejects(service.clearModel(), /remaining cache/);
  assert.equal(service.read().mfrModelPath, '');
  assert.deepEqual(service.events, ['persist', 'changed']);
  await service.update({ theme: 'dark' });
  assert.equal(service.read().theme, 'dark');
});
