import React, { useState } from 'react';
import { useAppStore } from '../store';
import { cleanSettingsError } from '../settings-autosave';
import { useI18n } from '../hooks/useI18n';

const modelFiles = [
  'encoder_model.onnx',
  'decoder_model.onnx',
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
];

export default function MfrModelSettings() {
  const { t, message } = useI18n();
  const { mfrStatus, settings, showToast, setSettings, isRecognizing } = useAppStore();
  const [operation, setOperation] = useState<'download' | 'select' | 'clear' | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const working =
    operation !== null ||
    mfrStatus?.state === 'downloading' ||
    mfrStatus?.state === 'validating' ||
    mfrStatus?.state === 'loading' ||
    mfrStatus?.state === 'clearing';
  const ready = mfrStatus?.state === 'ready';
  const error = operationError || mfrStatus?.error;
  const progress =
    mfrStatus && mfrStatus.totalBytes > 0
      ? Math.min(100, (mfrStatus.downloadedBytes / mfrStatus.totalBytes) * 100)
      : undefined;

  const configureModel = async (action: 'download' | 'select') => {
    if (working || (action === 'download' && ready)) return;
    setOperation(action);
    setOperationError(null);
    try {
      const fresh =
        action === 'select'
          ? await window.api.selectMfrModel()
          : await window.api.downloadMfrModel();
      if (!fresh) return; // The native directory picker was cancelled.
      const current = useAppStore.getState().settings;
      setSettings({ ...fresh, ...current, mfrModelPath: fresh.mfrModelPath });
      showToast('Local model validated and ready');
    } catch (err) {
      setOperationError(cleanSettingsError(err));
    } finally {
      setOperation(null);
    }
  };

  const clearModel = async () => {
    if (working || isRecognizing) return;
    setOperation('clear');
    setOperationError(null);
    try {
      const fresh = await window.api.clearMfrModel();
      if (!fresh) return;
      const current = useAppStore.getState().settings;
      setSettings({ ...fresh, ...current, mfrModelPath: fresh.mfrModelPath });
      showToast('Model cache cleared. You can download or select a model again.');
    } catch (err) {
      setOperationError(cleanSettingsError(err));
    } finally {
      setOperation(null);
    }
  };

  const openModelPage = async () => {
    try {
      await window.api.openMfrModelPage();
    } catch (err) {
      setOperationError(cleanSettingsError(err));
    }
  };

  // The model ships inside the install — nothing to download, select, or clear by default.
  // Only a rare power user who wants a different/custom model folder needs the controls below,
  // so they're tucked behind "Use a different model folder" instead of shown unconditionally.
  if (ready && mfrStatus?.isBundled && !showAdvanced) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-3">{t('Local Formula Model')}</h2>
        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">
            ●
          </span>
          <p className="text-sm font-medium">{t('Built in and ready — no setup needed.')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(true)}
          className="mt-2 text-xs text-brand-600 dark:text-brand-400 underline"
        >
          {t('Use a different model folder')}
        </button>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{t('Local Formula Model')}</h2>
      {mfrStatus?.isBundled && (
        <button
          type="button"
          onClick={() => setShowAdvanced(false)}
          className="mb-3 text-xs text-brand-600 dark:text-brand-400 underline"
        >
          {t('Back to built-in model')}
        </button>
      )}
      <p className="text-sm text-gray-500 mb-3">
        {t(
          "K-MathSnip already ships with a formula model, so this is only for pointing it at a different copy. Files are verified and test-run before they're used.",
        )}
      </p>
      <p className="text-xs text-gray-500 mb-4">
        {t('Snip a single formula with a small margin around it for the most reliable result.')}
      </p>

      <div className="p-3 border border-gray-200 dark:border-gray-700 rounded space-y-3">
        <p className="text-sm font-medium" role="status" aria-live="polite">
          {mfrStatus?.state === 'clearing' || operation === 'clear'
            ? t('Clearing model cache...')
            : mfrStatus?.state === 'validating'
              ? t('Verifying local model files...')
              : mfrStatus?.state === 'loading'
                ? t('Loading and testing local model...')
                : mfrStatus?.state === 'downloading'
                  ? t('Downloading MFR-1.5...')
                  : operation === 'select'
                    ? t('Selecting and checking a model folder...')
                    : operation === 'download'
                      ? t('Preparing local model...')
                      : ready
                        ? t('MFR-1.5 is ready')
                        : !mfrStatus
                          ? t('Checking local model...')
                          : mfrStatus.state === 'error'
                            ? t('Model setup needs attention')
                            : t('Model has not been downloaded')}
        </p>

        {mfrStatus?.state === 'downloading' && (
          <div>
            <progress
              aria-label={t('MFR-1.5 model download')}
              max={100}
              value={progress}
              className="block w-full h-2 accent-brand-600"
            />
            <p className="text-xs text-gray-500 mt-1">
              {progress !== undefined
                ? `${(mfrStatus.downloadedBytes / 1_000_000).toFixed(1)} / ${(mfrStatus.totalBytes / 1_000_000).toFixed(1)} MB (${Math.floor(progress)}%)`
                : t('Preparing download...')}
            </p>
          </div>
        )}

        {(settings?.mfrModelPath || mfrStatus?.modelPath) && (
          <p className="text-xs text-gray-500 break-all">
            {t('Model folder: {path}', {
              path: settings?.mfrModelPath || mfrStatus?.modelPath || '',
            })}
          </p>
        )}
        {settings?.mfrModelPath && (
          <p className="text-xs text-gray-500">
            {t(
              'This folder is remembered across restarts. Keep it in this location so the model stays available.',
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void configureModel('download')}
            disabled={working || !mfrStatus || ready}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {t('Download Local Model')}
          </button>
          <button
            type="button"
            onClick={() => void configureModel('select')}
            disabled={working || !mfrStatus}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {t('Select Local Model')}
          </button>
          <button
            type="button"
            onClick={() => void clearModel()}
            disabled={working || isRecognizing || !mfrStatus}
            className="px-4 py-2 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
          >
            {t('Clear Model Cache')}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {t(
            'Clear downloaded model files and release the selected model. External model folders you selected are kept.',
          )}
        </p>

        {error && (
          <div role="alert" className="space-y-2 text-sm text-red-600 dark:text-red-400">
            <p className="break-words">{message(error)}</p>
            {ready && <p>{t('Your previous model remains available.')}</p>}
            <p>
              {t(
                'If the download fails or times out, download the model files in your browser and use Select Local Model. Follow the manual download instructions below.',
              )}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2 text-sm text-gray-500">
        <p className="font-medium">{t('Manual download')}</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            {t('Open the supported model version:')}{' '}
            <button
              type="button"
              onClick={() => void openModelPage()}
              className="text-brand-600 dark:text-brand-400 underline"
            >
              {t('MFR-1.5 files on Hugging Face')}
            </button>
          </li>
          <li>
            {t('Download all eight files listed below into the same folder, keeping their names.')}
          </li>
          <li>{t('Click Select Local Model and choose the folder containing those files.')}</li>
        </ol>
        <details className="text-xs">
          <summary className="cursor-pointer">{t('Required model files (8)')}</summary>
          <ul className="mt-2 font-mono space-y-1">
            {modelFiles.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
