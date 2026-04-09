import { AgentConfig, InstanceConfig } from "./config.js";
export declare class ClawHomeClient {
    private instanceConfig;
    private agentConfig;
    private ws;
    private heartbeatTimer;
    private reportTimer;
    private reconnectDelay;
    private stopping;
    private authenticated;
    constructor(instanceConfig: InstanceConfig, agentConfig: AgentConfig);
    start(): void;
    stop(): void;
    private connect;
    private scheduleReconnect;
    private authenticate;
    private handleMessage;
    private handleCommand;
    private startHeartbeat;
    private startReporting;
    private reportMetrics;
    protected collectMetrics(): Promise<Record<string, number>>;
    private send;
    private clearTimers;
}
//# sourceMappingURL=client.d.ts.map