import { useCallback, useEffect, useRef } from "react";
import {
  AppEvents,
  useAPIEventListener,
  type RNPlugin,
} from "@remnote/plugin-sdk";
import { LANGUAGE_SETTING, setLanguage } from "./i18n";
import { useLanguage } from "./use-language";

export function usePluginLanguage(plugin: RNPlugin) {
  const language = useLanguage();
  const request = useRef(0);
  const refresh = useCallback(() => {
    const id = ++request.current;
    void plugin.settings
      .getSetting(LANGUAGE_SETTING)
      .then((value) => {
        if (id === request.current) setLanguage(value);
      })
      .catch(() => {});
  }, [plugin]);
  useAPIEventListener(AppEvents.SettingChanged, LANGUAGE_SETTING, refresh);
  useEffect(() => {
    refresh();
    return () => {
      ++request.current;
    };
  }, [refresh]);
  return language;
}
