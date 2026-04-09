export interface CommandsConfig {
    [action: string]: string;
}
export interface MetricSourceConfig {
    source: "system" | "file" | "command" | "api";
    path?: string;
    jq?: string;
    command?: string;
    url?: string;
    method?: string;
}
export interface MetricsConfig {
    [metricKey: string]: MetricSourceConfig;
}
export interface AgentConfig {
    agent_type: string;
    commands: CommandsConfig;
    metrics: MetricsConfig;
    report_interval: number;
}
export interface InstanceConfig {
    instanceId: string;
    serverUrl: string;
    accessToken: string | null;
    bindToken: string | null;
    localPort: number;
    agentType: string;
    hostname: string;
}
//# sourceMappingURL=config.d.ts.map