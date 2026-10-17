import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import english from './locales/en.json';
import arabic from './locales/ar.json';

const LanguageContext = createContext(null);
const LANGUAGE_KEY = 'aw_language';
const englishPhraseKeys = new Map();
for (const [key, value] of Object.entries(english)) {
  if (typeof value === 'string' && !englishPhraseKeys.has(value)) englishPhraseKeys.set(value, key);
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => (
    localStorage.getItem(LANGUAGE_KEY) === 'ar' ? 'ar' : 'en'
  ));

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t(key, fallback = key) {
      const lookupKey = Object.hasOwn(english, key) ? key : (englishPhraseKeys.get(key) || key);
      if (language === 'ar') return arabic[lookupKey] || english[lookupKey] || fallback;
      return english[lookupKey] || fallback;
    },
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

export function LocalizedText({ source }) {
  const { t } = useLanguage();
  return t(source, source);
}

export function localizedContent(source, translations, language, field = null) {
  if (typeof source !== 'string' || language === 'en') return source;
  const translated = field ? translations?.[language]?.[field] : translations?.[language];
  return typeof translated === 'string' && translated.trim() ? translated : source;
}

export function localizedContentList(sources, translations, language, field) {
  if (!Array.isArray(sources)) return [];
  const translated = translations?.[language]?.[field];
  return sources.map((source, index) => localizedContent(source, { [language]: translated?.[index] }, language));
}

export function LanguageToggle({ className = '' }) {
  const { language, setLanguage, t } = useLanguage();
  const next = language === 'en' ? 'ar' : 'en';
  return (
    <button
      type="button"
      className={`language-toggle${className ? ` ${className}` : ''}`}
      onClick={() => setLanguage(next)}
      aria-label={`${t('nav.language', 'Language')}: ${next === 'ar' ? t('language.arabic', 'Arabic') : t('language.english')}`}
      aria-pressed={language === 'ar'}
    >
      {next === 'ar' ? t('language.arabic', 'Arabic') : 'EN'}
    </button>
  );
}
