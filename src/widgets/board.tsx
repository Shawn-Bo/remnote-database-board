import { t } from "../i18n";
import { usePluginLanguage } from "../use-plugin-language";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { renderWidget, usePlugin } from "@remnote/plugin-sdk";
import {
  NativeNote,
  NativeRichText,
  NativeRichTextProvider,
} from "../NativeRichText";
import { Board } from "../Board";
import { SdkBoardPort } from "../sdk-port";
import { LAST_CONFIG_KEY, configKey, saveConfig } from "../config";
import { readPaneContext } from "../widget-context";
import type { Config } from "../model";
import type { BoardOpening } from "../views";
import "../board.css";

function BoardWidget() {
  const plugin = usePlugin();
  usePluginLanguage(plugin);
  const port = useMemo(() => new SdkBoardPort(plugin), [plugin]);
  const [context, setContext] = useState<{
    initial: Partial<Config> & { tagId: string };
    rowScope?: string[];
    openingBoard?: BoardOpening;
  }>();
  const [error, setError] = useState("");
  const persist = useCallback(
    (config: Config) => saveConfig(plugin, config),
    [plugin],
  );
  const loadConfig = useCallback(
    (tagId: string) => plugin.storage.getSynced<Config>(configKey(tagId)),
    [plugin],
  );
  useEffect(() => {
    let alive = true;
    void (async () => {
      const {
        config: raw,
        rowScope,
        openingBoard,
      } = readPaneContext(await plugin.widget.getWidgetContext());
      const previous = await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
      const tagId =
        typeof raw.tagId === "string" ? raw.tagId : (previous?.tagId ?? "");
      const stored = tagId
        ? await plugin.storage.getSynced<Config>(configKey(tagId))
        : undefined;
      const initial = { ...stored, ...raw, tagId };
      if (alive) setContext({ initial, rowScope, openingBoard });
    })().catch((e) => {
      if (alive) setError(String(e));
    });
    return () => {
      alive = false;
    };
  }, [plugin]);
  if (error)
    return (
      <div role="alert">
        {t("Could not open board: ")}
        {error}
      </div>
    );
  return context ? (
    <NativeRichTextProvider plugin={plugin}>
      <Board
        port={port}
        initial={context.initial}
        openingBoard={context.openingBoard}
        renderNote={(remId) => <NativeNote key={remId} remId={remId} />}
        rowScope={context.rowScope}
        onConfig={persist}
        loadConfig={loadConfig}
        onClose={() => plugin.widget.closePopup()}
        renderRichCell={(cell, mode) => (
          <NativeRichText
            text={cell.richText!}
            maxHeight={mode === "card" ? 160 : mode === "table" ? 200 : 500}
          />
        )}
      />
    </NativeRichTextProvider>
  ) : (
    <div style={{ padding: 24 }}>{t("Connecting to RemNote database…")}</div>
  );
}
renderWidget(BoardWidget);
