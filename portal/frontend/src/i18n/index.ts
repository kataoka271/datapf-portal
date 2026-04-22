import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./ja";
import en from "./en";

const browserLang = navigator.language.startsWith("ja") ? "ja" : "en";

i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: browserLang,
  fallbackLng: "ja",
  interpolation: { escapeValue: false },
});

export default i18n;
