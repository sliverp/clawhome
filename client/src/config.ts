// Agent configuration types

export interface CommandsConfig {
  [action: string]: string; // e.g. restart: "openclaw gateway restart"
}

export interface MetricSourceConfig {
  source: "system" | "file" | "command" | "api";
  // file source
  path?: string;
  jq?: string; // simple dot-notation key, e.g. ".total_tokens"
  // command source
  command?: string;
  // api source
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
  report_interval: number; // seconds
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
