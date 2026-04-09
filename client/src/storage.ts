import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { AgentConfig, InstanceConfig } from "./config.js";

export function clawhomeDir(instanceId: string): string {
  return path.join(os.homedir(), ".clawhome", instanceId);
}

export function loadAgentConfig(instanceId: string): AgentConfig {
  const file = path.join(clawhomeDir(instanceId), "agent-config.yaml");
  const raw = fs.readFileSync(file, "utf-8");
  return yaml.load(raw) as AgentConfig;
}

export function saveAgentConfig(instanceId: string, config: AgentConfig): void {
  const dir = clawhomeDir(instanceId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "agent-config.yaml");
  fs.writeFileSync(file, yaml.dump(config), "utf-8");
}

export function loadInstanceConfig(instanceId: string): InstanceConfig {
  const file = path.join(clawhomeDir(instanceId), "config.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")) as InstanceConfig;
}

export function saveInstanceConfig(instanceId: string, config: InstanceConfig): void {
  const dir = clawhomeDir(instanceId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "config.json");
  fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
}

export function listInstances(): string[] {
  const base = path.join(os.homedir(), ".clawhome");
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter((d) => {
    const cfg = path.join(base, d, "config.json");
    return fs.existsSync(cfg);
  });
}

/**
 * Find a free TCP port starting from `start`.
 */
export async function findFreePort(start: number): Promise<number> {
  const net = await import("net");
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1));
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };
    tryPort(start);
  });
}
