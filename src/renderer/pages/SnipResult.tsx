import React from 'react';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import Preview from '../components/Preview';
import { recognizeImage } from '../hooks/useOCR';

const tabs = [
  { key: 'latex' as const, label: 'LaTeX' },
  { key: 'markdown' as const, label: 'Markdown' },
  { key: 'text' as const, label: 'Text' },
  { key: 'image' as const, label: 'Image' },
];

export default function SnipResult() {
  const { t, message } = useI18n();
  const {
    activeTab,
    setActiveTab,
    ocrResult,
    isRecognizing,
    error,
    currentImage,
    showToast,
    mfrStatus,
    setCurrentPage,
  } = useAppStore();

  const copyResult = async (format: 'latex' | 'markdown' | 'text') => {
    if (!ocrResult) return;
    const text =
      format === 'latex'
        ? ocrResult.latex
        : format === 'markdown'
          ? ocrResult.markdown
          : ocrResult.text;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied!');
    } catch {
      showToast('Could not copy. Please try again.');
    }
  };

  const copyForWord = async () => {
    if (!ocrResult) return;
    const result = await window.api.copyForWord(ocrResult.latex);
    if (result.ok) {
      showToast('Copied — press Ctrl+V in Word for a real editable equation.');
    } else {
      showToast(`Could not build a Word equation from this (${result.reason}). Try Copy LaTeX instead.`);
    }
  };

  const copyForMathType = async () => {
    if (!ocrResult) return;
    const result = await window.api.copyForMathType(ocrResult.latex);
    if (result.ok) {
      showToast('Copied — paste into MathType for a real editable equation.');
    } else {
      showToast(`Could not build a MathType equation from this (${result.reason}). Try Copy LaTeX instead.`);
    }
  };

  const retry = () => {
    if (currentImage) void recognizeImage(currentImage);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar + copy buttons */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                activeTab === key
                  ? 'bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 font-medium'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {message(label)}
            </button>
          ))}
        </div>

        {ocrResult && activeTab !== 'image' && (
          <div className="flex gap-2">
            <button
              onClick={copyForWord}
              className="px-3 py-1 text-sm border border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 rounded hover:bg-brand-50 dark:hover:bg-brand-950 transition-colors"
              title="Paste directly into Word as a real, editable equation (Ctrl+V)"
            >
              {t('Copy for Word')}
            </button>
            <button
              onClick={copyForMathType}
              className="px-3 py-1 text-sm border border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 rounded hover:bg-brand-50 dark:hover:bg-brand-950 transition-colors"
              title="Paste directly into MathType as a real, editable equation"
            >
              {t('Copy for MathType')}
            </button>
            <button
              onClick={() => copyResult(activeTab as 'latex' | 'markdown' | 'text')}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {t('Copy')}
            </button>
          </div>
        )}
      </div>

      {/* Loading spinner */}
      {isRecognizing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">{t('Recognizing with MFR-1.5...')}</span>
            <span className="text-xs text-gray-400">
              {t('Processing the formula on this device.')}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isRecognizing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center px-8">
            <p className="text-red-500 text-sm">{message(error)}</p>
            {mfrStatus?.state !== 'ready' ? (
              <button
                onClick={() => setCurrentPage('settings')}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 transition-colors"
              >
                {t('Open Model Settings')}
              </button>
            ) : currentImage ? (
              <button
                onClick={retry}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 transition-colors"
              >
                {t('Retry')}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Preview */}
      {!isRecognizing && !error && <Preview />}
    </div>
  );
}
