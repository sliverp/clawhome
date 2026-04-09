import WebSocket from "ws";
import { collectCustomMetrics } from "./collectors/custom.js";
import { executeCommand } from "./executor.js";
import { saveInstanceConfig } from "./storage.js";
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
export class ClawHomeClient {
    instanceConfig;
    agentConfig;
    ws = null;
    heartbeatTimer = null;
    reportTimer = null;
    reconnectDelay = RECONNECT_BASE_MS;
    stopping = false;
    authenticated = false;
    constructor(instanceConfig, agentConfig) {
        this.instanceConfig = instanceConfig;
        this.agentConfig = agentConfig;
    }
    start() {
        this.stopping = false;
        this.connect();
    }
    stop() {
        this.stopping = true;
        this.clearTimers();
        this.ws?.close();
    }
    // ── Connection ────────────────────────────────────────────────────────────
    connect() {
        const wsUrl = this.instanceConfig.serverUrl.replace(/^http/, "ws") + "/ws/agent";
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
            if (!this.stopping)
                this.scheduleReconnect();
        });
        this.ws.on("error", (err) => {
            console.error("[clawhome] WebSocket error:", err.message);
        });
    }
    scheduleReconnect() {
        console.log(`[clawhome] Reconnecting in ${this.reconnectDelay / 1000}s`);
        setTimeout(() => {
            if (!this.stopping)
                this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    }
    authenticate() {
        if (this.instanceConfig.accessToken) {
            this.send({ type: "auth", data: { access_token: this.instanceConfig.accessToken } });
        }
        else if (this.instanceConfig.bindToken) {
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
    handleMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        switch (msg.type) {
            case "auth_ok":
                console.log(`[clawhome] Authenticated as agent #${msg.data.agent_id}`);
                this.authenticated = true;
                this.startReporting();
                break;
            case "bind_ok": {
                const accessToken = msg.data.access_token;
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
                void this.handleCommand(msg.data.cmd, msg.data.request_id);
                break;
            case "error":
                console.error("[clawhome] Server error:", msg.data.message);
                break;
        }
    }
    // ── Commands ──────────────────────────────────────────────────────────────
    async handleCommand(cmd, requestId) {
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
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.send({ type: "ping", data: { ts: Date.now() } });
        }, HEARTBEAT_INTERVAL_MS);
    }
    // ── Metrics reporting ─────────────────────────────────────────────────────
    startReporting() {
        const intervalMs = (this.agentConfig.report_interval || 30) * 1000;
        void this.reportMetrics();
        this.reportTimer = setInterval(() => void this.reportMetrics(), intervalMs);
    }
    async reportMetrics() {
        if (!this.authenticated)
            return;
        try {
            const metrics = await this.collectMetrics();
            this.send({ type: "metrics", data: metrics });
        }
        catch (err) {
            console.error("[clawhome] Failed to collect metrics:", err);
        }
    }
    // Subclasses may override to inject additional metrics (e.g. from local API)
    async collectMetrics() {
        return collectCustomMetrics(this.agentConfig.metrics);
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    send(msg) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    clearTimers() {
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        if (this.reportTimer)
            clearInterval(this.reportTimer);
        this.heartbeatTimer = null;
        this.reportTimer = null;
    }
}
//# sourceMappingURL=client.js.map