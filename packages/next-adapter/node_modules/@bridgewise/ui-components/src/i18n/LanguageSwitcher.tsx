import React from 'react';
import { useI18n } from './i18n-context';
import { Language } from './translations';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useI18n();

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
  ];

  return (
    <div className="bw-language-switcher">
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="bw-select"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
      <style>{`
        .bw-language-switcher {
          display: inline-block;
          position: relative;
        }
        .bw-select {
          appearance: none;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          padding: 8px 12px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s ease;
          outline: none;
        }
        .bw-select:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .bw-select option {
          background: #1a1a1a;
          color: white;
        }
      `}</style>
    </div>
  );
};
