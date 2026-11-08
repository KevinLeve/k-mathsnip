import React from 'react';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';

export default function StatusBar() {
  const { t, message } = useI18n();
  const { isRecognizing, error, mfrStatus } = useAppStore();

  const ready = mfrStatus?.state === 'ready';
  const checking =
    !mfrStatus || ['downloading', 'validating', 'loading', 'clearing'].includes(mfrStatus.state);
  const status = !mfrStatus
    ? t('Checking model...')
    : mfrStatus.state === 'ready'
      ? t('Model ready')
      : mfrStatus.state === 'downloading'
        ? t('Downloading model...')
        : mfrStatus.state === 'validating'
          ? t('Verifying model...')
          : mfrStatus.state === 'loading'
            ? t('Loading model...')
            : mfrStatus.state === 'clearing'
              ? t('Clearing model cache...')
              : mfrStatus.state === 'error'
                ? t('Model unavailable')
                : t('Model download required');

  return (
    <footer className="flex items-center justify-between px-4 py-1 text-xs border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-ink-raised text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              ready ? 'bg-green-500' : checking ? 'bg-yellow-500' : 'bg-red-500'
            }`}
          />
          {status}
        </span>
        <span>{t('Local MFR-1.5')}</span>
      </div>

      <div>
        {isRecognizing && <span className="animate-pulse">{t('Recognizing...')}</span>}
        {error && <span className="text-red-500">{message(error)}</span>}
        {!isRecognizing && !error && (
          <span>{checking ? t('Preparing model...') : ready ? t('Ready') : t('Setup needed')}</span>
        )}
      </div>
    </footer>
  );
}
