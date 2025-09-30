import es from "./es";
import en from "./en";
import ptBR from "./pt-BR";

const translations = {
  es,
  en,
  "pt-BR": ptBR,
};

export function t(lang, key) {
  return translations[lang]?.[key] || key;
}
