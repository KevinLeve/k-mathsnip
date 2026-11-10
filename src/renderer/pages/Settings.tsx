import React, { useEffect, useState, useSyncExternalStore } from 'react';
import type { OutputFormat, Theme } from '../../shared/types';
import { settingsSession } from '../settings-session';
import MfrModelSettings from '../components/MfrModelSettings';
import { useI18n } from '../hooks/useI18n';

const inputClass =
  'mt-1 block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500';

function FieldError({ message: error }: { message?: string }) {
  const { t, message } = useI18n();
  return error ? (
    <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
      {message(error)} {t('Previous settings remain active.')}
    </p>
  ) : null;
}

export default function Settings() {
  const { t } = useI18n();
  const {
    draft: local,
    applied,
    saving,
    pending,
    errors,
  } = useSyncExternalStore(settingsSession.subscribe, settingsSession.getSnapshot);
  const [updateCheck, setUpdateCheck] = useState<
    { status: 'idle' } | { status: 'checking' } | { status: 'done'; label: string }
  >({ status: 'idle' });

  const checkForUpdates = async () => {
    setUpdateCheck({ status: 'checking' });
    const result = await window.api.checkForUpdates();
    const label =
      result.state === 'update-available'
        ? `Update ${result.version} found — downloading.`
        : result.state === 'up-to-date'
          ? `You're up to date (v${result.version}).`
          : `Could not check for updates: ${result.error}`;
    setUpdateCheck({ status: 'done', label });
  };

  // The queue is independent of this page: navigating away cannot discard a pending edit.
  useEffect(() => () => settingsSession.flush(), []);

  if (!local || !applied) return null;
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        settingsSession.flush();
      }}
      className="max-w-lg mx-auto p-6 space-y-8"
    >
      <div role="status" aria-live="polite" className="text-sm text-gray-500">
        {saving
          ? t('Applying changes...')
          : pending
            ? t('Changes will apply automatically when you finish typing.')
            : hasErrors
              ? t('Some changes could not be applied. Correct the fields below to try again.')
              : t('Changes are saved and applied automatically.')}
      </div>

      <MfrModelSettings />

      <section>
        <h2 className="text-lg font-semibold mb-4">{t('Preferences')}</h2>
        <p className="text-xs text-gray-500 mb-4">
          {t('Change the interface language in View → Language.')}
        </p>
        <label className="block mb-3">
          <span className="text-sm font-medium">{t('Snip Hotkey')}</span>
          <input
            type="text"
            aria-label={t('Snip Hotkey')}
            value={local.snipHotkey}
            onChange={(event) => settingsSession.edit('snipHotkey', event.target.value)}
            onBlur={() => settingsSession.flush('snipHotkey')}
            className={inputClass}
          />
          <span className="text-xs text-gray-500">{t('e.g. CommandOrControl+Shift+S')}</span>
          <FieldError message={errors.snipHotkey} />
        </label>
        <fieldset className="mb-3">
          <legend className="text-sm font-medium">{t('Default Output Format')}</legend>
          <div className="flex gap-4 mt-2">
            {(['latex', 'markdown', 'text'] as OutputFormat[]).map((format) => (
              <label key={format} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="outputFormat"
                  checked={local.defaultOutputFormat === format}
                  onChange={() => settingsSession.edit('defaultOutputFormat', format, true)}
                />
                {t(format === 'latex' ? 'LaTeX' : format === 'markdown' ? 'Markdown' : 'Text')}
              </label>
            ))}
          </div>
          <FieldError message={errors.defaultOutputFormat} />
        </fieldset>
        <fieldset className="mb-3">
          <legend className="text-sm font-medium">{t('Theme')}</legend>
          <div className="flex gap-4 mt-2">
            {(['light', 'dark', 'system'] as Theme[]).map((theme) => (
              <label key={theme} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="theme"
                  checked={local.theme === theme}
                  onChange={() => settingsSession.edit('theme', theme, true)}
                />
                {t(theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System')}
              </label>
            ))}
          </div>
          <FieldError message={errors.theme} />
        </fieldset>
        <label className="block mb-3">
          <span className="text-sm font-medium">{t('History Limit')}</span>
          <input
            type="number"
            aria-label={t('History Limit')}
            min={10}
            max={500}
            value={Number.isNaN(local.historyLimit) ? '' : local.historyLimit}
            onChange={(event) => settingsSession.edit('historyLimit', event.target.valueAsNumber)}
            onBlur={() => settingsSession.flush('historyLimit')}
            className={`${inputClass} !w-24`}
          />
          <FieldError message={errors.historyLimit} />
        </label>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">{t('Convert to MathType')}</h2>
        <p className="text-sm mb-2">
          <kbd className="px-1.5 py-0.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-800">
            Ctrl+Shift+M
          </kbd>
        </p>
        <p className="text-xs text-gray-500">
          {t(
            'In Word, after pasting an equation (Ctrl+V), press Ctrl+Shift+M to convert it into a real MathType object. Requires MathType to be installed.',
          )}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          {t(
            'One-time setup: open MathType\'s Convert Equations dialog once (MathType tab in Word), enable "Word 2007 and later (OMML) equations" as a source, set the target to "MathType equations (OLE objects)", and uncheck "Prompt before converting each equation."',
          )}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">{t('About')}</h2>
        <p className="text-sm text-gray-500 mb-2">K-MathSnip v0.2.0</p>
        <button
          type="button"
          onClick={checkForUpdates}
          disabled={updateCheck.status === 'checking'}
          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {updateCheck.status === 'checking' ? t('Checking…') : t('Check for Updates')}
        </button>
        {updateCheck.status === 'done' && (
          <p className="text-sm text-gray-500 mt-2">{updateCheck.label}</p>
        )}
      </section>
    </form>
  );
}
