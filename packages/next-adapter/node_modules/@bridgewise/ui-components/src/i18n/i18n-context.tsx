import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language } from './translations';

interface I18nContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
}

const I18nContext = createContext<I18nContextProps | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode; defaultLanguage?: Language }> = ({
  children,
  defaultLanguage = 'en',
}) => {
  const [language, setLanguage] = useState<Language>(defaultLanguage);

  const t = (path: string): string => {
    const keys = path.split('.');
    let current: any = translations[language];

    for (const key of keys) {
      if (current[key] === undefined) {
        return path;
      }
      current = current[key];
    }

    return current;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
