import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import pt from './locales/pt.json';
import type { Lang } from './lib/dates';

const STORAGE_KEY = 'lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pt: { translation: pt } },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng === 'pt' ? 'pt-BR' : 'en';
};
syncHtmlLang(i18n.language);

i18n.on('languageChanged', (lng) => {
  syncHtmlLang(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* storage unavailable */
  }
});

export const currentLang = (): Lang => (i18n.language === 'pt' ? 'pt' : 'en');

export default i18n;
