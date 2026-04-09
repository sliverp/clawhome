import WebSocket from "ws";
import { AgentConfig, InstanceConfig } from "./config.js";
import { collectCustomMetrics } from "./collectors/custom.js";
import { executeCommand } from "./executor.js";
import { saveInstanceConfig } from "./storage.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

export class ClawHomeClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
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
        // Persist access_token and clear bind_token
        this.instanceConfig.accessToken = accessToken;
        this.instanceConfig.bindToken = null;
        saveInstanceConfig(this.instanceConfig.instanceId, this.instanceConfig);
        this.authenticated = true;
        this.startReporting();
        break;
      }

      case "pong":
        // heartbeat acknowledged
        break;

      case "command":
        void this.handleCommand(
          msg.data.cmd as string,
          msg.data.request_id as string
        );
        break;

      case "error":
        console.error("[clawhome] Server error:", msg.data.message);
        break;
    }
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  private async handleCommand(cmd: string, requestId: string): Promise<void> {
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

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping", data: { ts: Date.now() } });
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
    } catch (err) {
      console.error("[clawhome] Failed to collect metrics:", err);
    }
  }

  // Subclasses may override to inject additional metrics (e.g. from local API)
  protected async collectMetrics(): Promise<Record<string, number>> {
    return collectCustomMetrics(this.agentConfig.metrics, this.instanceConfig.agentType);
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
    this.heartbeatTimer = null;
    this.reportTimer = null;
  }
}
