import { useEffect, useState } from "react";
import { getLanguage, subscribeLanguage } from "./i18n";

export function useLanguage() {
  const [language, update] = useState(getLanguage);
  useEffect(() => {
    const stop = subscribeLanguage(() => update(getLanguage()));
    update(getLanguage());
    return stop;
  }, []);
  return language;
}
