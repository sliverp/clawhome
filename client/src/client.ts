import WebSocket from "ws";
import { AgentConfig, InstanceConfig } from "./config.js";
import { collectCustomMetrics, collectCustomState } from "./collectors/custom.js";
import { executeCommand } from "./executor.js";
import { loadInstanceConfig, saveInstanceConfig } from "./storage.js";
import { StateSnapshot } from "./collectors/base.js";

const HEARTBEAT_INTERVAL_MS = 20_000;   // send ping every 20s
const PONG_TIMEOUT_MS = 10_000;         // force reconnect if no pong within 10s
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;        // cap at 30s (was 60s)

export class ClawHomeClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private reportTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = RECONNECT_BASE_MS;
  private stopping = false;
  private authenticated = false;

  constructor(
    private instanceConfig: InstanceConfig,
    private agentConfig: AgentConfig
  ) {}

  start(): void {
    this.stopping = false;
    this.connect();
  }

  stop(): void {
    this.stopping = true;
    this.clearTimers();
    this.ws?.close();
  }

  // ── Connection ────────────────────────────────────────────────────────────

  private connect(): void {
    const wsUrl = this.instanceConfig.serverUrl.replace(/^http/, "ws") + "/api/ws/agent";
    console.log(`[clawhome] Connecting to ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      console.log("[clawhome] Connected");
      this.reconnectDelay = RECONNECT_BASE_MS;
      this.authenticate();
      this.startHeartbeat();
    });

    this.ws.on("message", (raw) => this.handleMessage(raw.toString()));

    this.ws.on("close", () => {
      console.log("[clawhome] Disconnected");
      this.authenticated = false;
      this.clearTimers();
      if (!this.stopping) this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      // error is always followed by close, so reconnect is handled there
      console.error("[clawhome] WebSocket error:", err.message);
    });
  }

  private scheduleReconnect(): void {
    console.log(`[clawhome] Reconnecting in ${this.reconnectDelay / 1000}s`);
    setTimeout(() => {
      if (!this.stopping) this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private forceReconnect(reason: string): void {
    console.warn(`[clawhome] Force reconnect: ${reason}`);
    this.clearTimers();
    this.authenticated = false;
    this.ws?.terminate(); // hard close, triggers 'close' event → scheduleReconnect
  }

  private authenticate(): void {
    if (this.instanceConfig.accessToken) {
      this.send({ type: "auth", data: { access_token: this.instanceConfig.accessToken } });
    } else if (this.instanceConfig.bindToken) {
      this.send({
        type: "bind",
        data: {
          bind_token: this.instanceConfig.bindToken,
          agent_type: this.instanceConfig.agentType,
          hostname: this.instanceConfig.hostname,
          local_port: this.instanceConfig.localPort,
          name: `${this.instanceConfig.hostname}-${this.instanceConfig.agentType}`,
        },
      });
    }
  }

  // ── Message handling ──────────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let msg: { type: string; data: Record<string, unknown> };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "auth_ok":
        console.log(`[clawhome] Authenticated as agent #${msg.data.agent_id}`);
        this.authenticated = true;
        this.startReporting();
        break;

      case "bind_ok": {
        const accessToken = msg.data.access_token as string;
        console.log(`[clawhome] Bound successfully. Agent ID: ${msg.data.agent_id}`);
        this.instanceConfig.accessToken = accessToken;
        this.instanceConfig.bindToken = null;
        // 合并而不是覆盖：磁盘上 setup-openapi 等外部工具可能写入了新字段
        // （如 openapi），只更新本次需要的两个字段后整体落盘
        try {
          const onDisk = loadInstanceConfig(this.instanceConfig.instanceId);
          const merged = { ...onDisk, accessToken, bindToken: null };
          saveInstanceConfig(this.instanceConfig.instanceId, merged);
          // 把磁盘上的字段同步回内存，确保后续逻辑（如 chat）能读到 openapi
          Object.assign(this.instanceConfig, merged);
        } catch {
          // 磁盘读失败时兜底：至少把内存里的状态写出去
          saveInstanceConfig(this.instanceConfig.instanceId, this.instanceConfig);
        }
        this.authenticated = true;
        this.startReporting();
        break;
      }

      case "pong":
        // Clear the pong timeout — connection is alive
        if (this.pongTimer) {
          clearTimeout(this.pongTimer);
          this.pongTimer = null;
        }
        break;

      case "ping":
        this.send({ type: "pong", data: { ts: msg.data.ts ?? Date.now() } });
        break;

      case "command":
        void this.handleCommand(
          msg.data.cmd as string,
          msg.data.request_id as string,
          msg.data.args as Record<string, unknown> | undefined
        );
        break;

      case "error":
        console.error("[clawhome] Server error:", msg.data.message);
        break;
    }
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  private async handleCommand(
    cmd: string,
    requestId: string,
    args?: Record<string, unknown>
  ): Promise<void> {
    if (cmd === "refresh") {
      try {
        await this.reportMetrics();
        this.send({
          type: "command_result",
          data: { request_id: requestId, success: true, output: "Metrics and state refreshed" },
        });
      } catch (error) {
        const output = error instanceof Error ? error.message : String(error);
        this.send({
          type: "command_result",
          data: { request_id: requestId, success: false, output },
        });
      }
      return;
    }

    if (cmd === "set_model") {
      const modelRef = typeof args?.model_ref === "string" ? args.model_ref.trim() : "";
      if (!modelRef) {
        this.send({
          type: "command_result",
          data: { request_id: requestId, success: false, output: "Missing model_ref" },
        });
        return;
      }

      console.log(`[clawhome] Setting OpenClaw model to ${modelRef}`);
      const result = await executeCommand(`openclaw models set ${modelRef}`);
      if (result.success) {
        await this.reportMetrics();
      }
      this.send({ type: "command_result", data: { request_id: requestId, ...result } });
      return;
    }

    if (cmd === "chat") {
      const message = typeof args?.message === "string" ? args.message.trim() : "";
      const sessionId = typeof args?.session_id === "string" ? args.session_id : undefined;
      console.log(`[clawhome] chat cmd received. request_id=${requestId} message=${JSON.stringify(message).slice(0, 100)}`);
      if (!message) {
        this.send({
          type: "command_result",
          data: { request_id: requestId, success: false, output: "Missing message" },
        });
        return;
      }

      // 走 openclaw-openapi 插件（本机 ws://127.0.0.1:<port>）
      // 端口和 token 从 instanceConfig.openapi 读取（init 时由 openapi-installer 写入）
      // 每次都重读磁盘，支持运行时 setup-openapi 热生效
      let openapi = (this.instanceConfig as any).openapi as
        | { port?: number; host?: string; token?: string }
        | undefined;
      console.log(`[clawhome] chat: in-memory openapi = ${JSON.stringify(openapi)}`);
      if (!openapi || !openapi.token || !openapi.port) {
        try {
          const onDisk = loadInstanceConfig(this.instanceConfig.instanceId);
          console.log(`[clawhome] chat: reloaded config from disk, keys=${Object.keys(onDisk).join(",")}`);
          if ((onDisk as any).openapi) {
            openapi = (onDisk as any).openapi;
            Object.assign(this.instanceConfig, { openapi });
            console.log(`[clawhome] chat: found openapi on disk = ${JSON.stringify(openapi)}`);
          } else {
            console.log(`[clawhome] chat: on-disk config has NO openapi field`);
          }
        } catch (err) {
          console.log(`[clawhome] chat: reload config failed: ${(err as Error).message}`);
        }
      }

      if (!openapi || !openapi.token || !openapi.port) {
        console.log(`[clawhome] chat: REJECT — no openapi info. file=${`~/.clawhome/${this.instanceConfig.instanceId}/config.json`}`);
        this.send({
          type: "command_result",
          data: {
            request_id: requestId,
            success: false,
            output: "",
            error:
              "openapi not configured. Run `clawhome-client setup-openapi` to install the plugin.",
          },
        });
        return;
      }

      const url = `ws://${openapi.host || "127.0.0.1"}:${openapi.port}`;
      console.log(`[clawhome] Sending chat to openclaw-openapi at ${url}`);

      try {
        const { chatOnce } = await import("./openapi-client.js");
        console.log(`[clawhome] chat: connecting to ${url} with token=${openapi.token!.slice(0, 6)}…`);
        const result = await chatOnce({
          url,
          token: openapi.token,
          message,
          sessionId,
          timeoutMs: 300_000,
        });
        console.log(`[clawhome] chat: got reply, text=${JSON.stringify(result.text).slice(0, 200)}`);
        this.send({
          type: "command_result",
          data: {
            request_id: requestId,
            success: true,
            output: {
              text: result.text,
              message_id: result.messageId,
              raw: result.raw,
            },
          },
        });
      } catch (err) {
        console.log(`[clawhome] chat: failed — ${(err as Error).message}`);
        this.send({
          type: "command_result",
          data: {
            request_id: requestId,
            success: false,
            output: "",
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
      return;
    }

    const commandStr = this.agentConfig.commands[cmd];
    if (!commandStr) {
      this.send({
        type: "command_result",
        data: { request_id: requestId, success: false, output: `Unknown command: ${cmd}` },
      });
      return;
    }

    console.log(`[clawhome] Executing command: ${cmd} -> ${commandStr}`);
    const result = await executeCommand(commandStr);
    this.send({ type: "command_result", data: { request_id: requestId, ...result } });
  }

  // ── Heartbeat (with pong timeout detection) ───────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      this.send({ type: "ping", data: { ts: Date.now() } });

      // Expect a pong back within PONG_TIMEOUT_MS
      this.pongTimer = setTimeout(() => {
        this.forceReconnect("pong timeout — server not responding");
      }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  // ── Metrics reporting ─────────────────────────────────────────────────────

  private startReporting(): void {
    const intervalMs = (this.agentConfig.report_interval || 30) * 1000;
    void this.reportMetrics();
    this.reportTimer = setInterval(() => void this.reportMetrics(), intervalMs);
  }

  private async reportMetrics(): Promise<void> {
    if (!this.authenticated) return;
    try {
      const metrics = await this.collectMetrics();
      this.send({ type: "metrics", data: metrics });
      const state = this.collectState();
      console.log("[clawhome] Collected agent state:", JSON.stringify(state));
      if (Object.keys(state).length > 0) {
        this.send({ type: "agent_state", data: state });
      }
    } catch (err) {
      console.error("[clawhome] Failed to collect metrics:", err);
    }
  }

  // Subclasses may override to inject additional metrics (e.g. from local API)
  protected async collectMetrics(): Promise<Record<string, number>> {
    return collectCustomMetrics(this.agentConfig.metrics, this.instanceConfig.agentType);
  }

  protected collectState(): StateSnapshot {
    return collectCustomState(this.instanceConfig.agentType);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(msg: { type: string; data: unknown }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reportTimer) clearInterval(this.reportTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.heartbeatTimer = null;
    this.reportTimer = null;
    this.pongTimer = null;
  }
}
