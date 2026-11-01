import { AppEvents, type RNPlugin } from "@remnote/plugin-sdk";
import { newId } from "./views";

const REQUEST = "fanvane-db-native-clip";
const RESPONSE = "fanvane-db-native-clip-result";
const payload = (event: any) => event?.message ?? event;

// RemNote only allows registerCSS in the index widget. Broadcasts stay within
// this plugin; acknowledge the actual registration before rendering an embed.
export function registerNativeClip(
  plugin: RNPlugin,
  id: string,
  css: string,
): Promise<void> {
  const requestId = newId();
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer);
      plugin.event.removeListener(
        AppEvents.MessageBroadcast,
        undefined,
        receive,
      );
      error ? reject(error) : resolve();
    };
    const receive = (event: unknown) => {
      const data = payload(event);
      if (data?.type === RESPONSE && data.requestId === requestId)
        done(data.error ? new Error(data.error) : undefined);
    };
    const timer = setTimeout(
      () => done(new Error("图片显示服务未响应，请重新加载插件。")),
      10000,
    );
    plugin.event.addListener(AppEvents.MessageBroadcast, undefined, receive);
    void plugin.messaging
      .broadcast({ type: REQUEST, requestId, id, css })
      .catch((error: Error) => done(error));
  });
}

export function installNativeClipBridge(plugin: RNPlugin): () => void {
  const sheets = new Set<string>();
  const receive = (event: unknown) => {
    const data = payload(event);
    if (
      data?.type !== REQUEST ||
      typeof data.requestId !== "string" ||
      typeof data.id !== "string" ||
      !/^fanvane-db-rich-[a-zA-Z0-9-]+$/.test(data.id) ||
      typeof data.css !== "string"
    )
      return;
    const { id, css, requestId } = data;
    sheets.add(id);
    void plugin.app
      .registerCSS(id, css)
      .then(
        () => plugin.messaging.broadcast({ type: RESPONSE, requestId }),
        (error: unknown) =>
          plugin.messaging.broadcast({
            type: RESPONSE,
            requestId,
            error: error instanceof Error ? error.message : String(error),
          }),
      )
      .catch(() => {});
  };
  plugin.event.addListener(AppEvents.MessageBroadcast, undefined, receive);
  return () => {
    plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, receive);
    for (const id of sheets)
      void plugin.app.registerCSS(id, "").catch(() => {});
  };
}
