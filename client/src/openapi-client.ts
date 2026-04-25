/**
 * 极简 OpenClaw OpenAPI WebSocket 客户端。
 *
 * 用于 clawhome-client 在本机连接 openclaw-openapi 插件（ws://127.0.0.1:3210）
 * 并发送一次性聊天消息。每次 chat 命令都新建一个连接、发送、等回复、关闭。
 * 单次发送场景不需要保活/重连/事件订阅。
 */
import WebSocket, { ClientOptions } from "ws";

export interface OpenApiChatOptions {
  url: string;          // ws://127.0.0.1:3210
  token: string;
  message: string;
  sessionId?: string;
  attachments?: string[];
  timeoutMs?: number;
}

export interface OpenApiChatResult {
  text: string;
  messageId?: string;
  raw: any;
}

/**
 * 连一次、发一次、等一次回复、关闭。
 * 失败抛异常（含连接超时、认证失败、回复超时、服务端 error 帧）。
 */
export async function chatOnce(opts: OpenApiChatOptions): Promise<OpenApiChatResult> {
  const timeout = opts.timeoutMs ?? 300_000;
  const sessionId = opts.sessionId ?? "default";
  const wsOpts: ClientOptions = {
    headers: { Authorization: `Bearer ${opts.token}` },
  };

  return new Promise<OpenApiChatResult>((resolve, reject) => {
    const ws = new WebSocket(opts.url, wsOpts);
    const msgId = `clawhome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let settled = false;

    const finish = (err: Error | null, val?: OpenApiChatResult) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      err ? reject(err) : resolve(val!);
    };

    const overall = setTimeout(
      () => finish(new Error(`OpenAPI chat timeout after ${timeout}ms`)),
      timeout
    );

    ws.on("open", () => {
      // 发送消息
      try {
        ws.send(JSON.stringify({
          type: "message",
          id: msgId,
          sessionId,
          text: opts.message,
          attachments: opts.attachments,
        }));
      } catch (e) {
        clearTimeout(overall);
        finish(e as Error);
      }
    });

    ws.on("message", (raw) => {
      let m: any;
      try { m = JSON.parse(String(raw)); } catch { return; }

      // 服务器认证结果（仅用 JSON 认证时才发；header 认证模式下不会有，但收到也忽略）
      if (m.type === "auth_result") {
        if (!m.ok) {
          clearTimeout(overall);
          finish(new Error(`OpenAPI auth failed: ${m.error || "unknown"}`));
        }
        return;
      }
      if (m.type === "pong") return;

      if (m.type === "reply" && m.replyTo === msgId) {
        clearTimeout(overall);
        finish(null, {
          text: typeof m.text === "string" ? m.text : "",
          messageId: m.messageId,
          raw: m,
        });
        return;
      }
      if (m.type === "error" && (m.replyTo === msgId || !m.replyTo)) {
        clearTimeout(overall);
        finish(new Error(`OpenAPI error: ${m.message || "unknown"}`));
        return;
      }
    });

    ws.on("error", (err) => {
      clearTimeout(overall);
      finish(err);
    });

    ws.on("close", (code, reason) => {
      if (!settled) {
        clearTimeout(overall);
        finish(new Error(
          `OpenAPI socket closed before reply (code=${code}, reason=${String(reason)})`
        ));
      }
    });
  });
}
