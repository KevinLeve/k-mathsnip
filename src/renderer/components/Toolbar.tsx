import React from 'react';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import appIcon from '../assets/icon.png';

export default function Toolbar() {
  const { t, message } = useI18n();
  const { currentPage, setCurrentPage, isRecognizing, showToast } = useAppStore();

  const navItems: { page: 'result' | 'settings' | 'history'; label: string }[] = [
    { page: 'result', label: 'Snip' },
    { page: 'history', label: 'History' },
    { page: 'settings', label: 'Settings' },
  ];

  return (
    <header
      className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-ink-raised select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span
        className="flex items-center gap-2 font-semibold text-sm mr-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <img src={appIcon} alt="" width={20} height={20} className="rounded" />
        K-MathSnip
      </span>

      <nav className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {navItems.map(({ page, label }) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              currentPage === page
                ? 'bg-brand-500 text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {message(label)}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        onClick={() =>
          window.api.startSnip().catch(() => showToast('Could not start screen capture.'))
        }
        disabled={isRecognizing}
        className="px-3 py-1 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50 disabled:cursor-wait transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {t('New Snip')}
      </button>
    </header>
  );
}
