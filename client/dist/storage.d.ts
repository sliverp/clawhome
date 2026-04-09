import { AgentConfig, InstanceConfig } from "./config.js";
export declare function clawhomeDir(instanceId: string): string;
export declare function loadAgentConfig(instanceId: string): AgentConfig;
export declare function saveAgentConfig(instanceId: string, config: AgentConfig): void;
export declare function loadInstanceConfig(instanceId: string): InstanceConfig;
export declare function saveInstanceConfig(instanceId: string, config: InstanceConfig): void;
export declare function listInstances(): string[];
/**
 * Find a free TCP port starting from `start`.
 */
export declare function findFreePort(start: number): Promise<number>;
//# sourceMappingURL=storage.d.ts.map