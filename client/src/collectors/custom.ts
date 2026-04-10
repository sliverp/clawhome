import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { MetricsConfig, MetricSourceConfig } from "../config.js";
import { MetricSnapshot, StateSnapshot } from "./base.js";
import { collectSystemMetrics } from "./system.js";
import { collectOpenclawMetrics, collectOpenclawState } from "./openclaw.js";

const execFileAsync = promisify(execFile);

/**
 * Resolve a simple dot-notation jq path like ".key.nested" against a JSON object.
 * Only supports simple key access, no arrays or filters.
 */
function resolvePath(obj: unknown, jqPath: string): number | null {
  const keys = jqPath.replace(/^\./, "").split(".");
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur === "number") return cur;
  if (typeof cur === "string") {
    const n = parseFloat(cur);
    return isNaN(n) ? null : n;
  }
  return null;
}

async function collectFromFile(cfg: MetricSourceConfig): Promise<number | null> {
  if (!cfg.path) return null;
  try {
    const resolved = cfg.path.replace(/^~/, process.env.HOME ?? "");
    const content = fs.readFileSync(resolved, "utf-8");
    const data = JSON.parse(content);
    return cfg.jq ? resolvePath(data, cfg.jq) : null;
  } catch {
    return null;
  }
}

async function collectFromCommand(cfg: MetricSourceConfig): Promise<number | null> {
  if (!cfg.command) return null;
  try {
    const parts = cfg.command.trim().split(/\s+/);
    const [bin, ...args] = parts;
    const { stdout } = await execFileAsync(bin!, args, { timeout: 10_000 });
    if (cfg.jq) {
      try {
        const data = JSON.parse(stdout);
        return resolvePath(data, cfg.jq);
      } catch {
        const n = parseFloat(stdout.trim());
        return isNaN(n) ? null : n;
      }
    }
    const n = parseFloat(stdout.trim());
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

async function collectFromApi(cfg: MetricSourceConfig): Promise<number | null> {
  if (!cfg.url) return null;
  try {
    const res = await fetch(cfg.url, { method: cfg.method ?? "GET", signal: AbortSignal.timeout(8_000) });
    const data = await res.json();
    return cfg.jq ? resolvePath(data, cfg.jq) : null;
  } catch {
    return null;
  }
}

/** Agent-type-specific native collectors */
const NATIVE_COLLECTORS: Record<string, () => MetricSnapshot> = {
  openclaw: collectOpenclawMetrics,
}

const NATIVE_STATE_COLLECTORS: Record<string, () => StateSnapshot> = {
  openclaw: collectOpenclawState,
}

export async function collectCustomMetrics(metricsConfig: MetricsConfig, agentType?: string): Promise<MetricSnapshot> {
  const systemMetrics = await collectSystemMetrics();
  const snapshot: MetricSnapshot = { ...systemMetrics };

  // Run native collector. If agentType is known use it directly;
  // otherwise fall back to openclaw if ~/.openclaw directory exists.
  const nativeCollector =
    (agentType && NATIVE_COLLECTORS[agentType]) ||
    (fs.existsSync(path.join(os.homedir(), '.openclaw')) ? collectOpenclawMetrics : null);

  if (nativeCollector) {
    try {
      Object.assign(snapshot, nativeCollector());
    } catch (e) {
      console.error('[clawhome] Native collector error:', e);
    }
  }

  // Then run any additional metrics defined in config (file/command/api sources)
  await Promise.all(
    Object.entries(metricsConfig).map(async ([key, cfg]) => {
      if (cfg.source === "system") return; // already collected

      let value: number | null = null;
      if (cfg.source === "file") value = await collectFromFile(cfg);
      else if (cfg.source === "command") value = await collectFromCommand(cfg);
      else if (cfg.source === "api") value = await collectFromApi(cfg);

      if (value !== null) {
        snapshot[key] = value;
      }
    })
  );

  return snapshot;
}

export function collectCustomState(agentType?: string): StateSnapshot {
  const nativeCollector =
    (agentType && NATIVE_STATE_COLLECTORS[agentType]) ||
    (fs.existsSync(path.join(os.homedir(), '.openclaw')) ? collectOpenclawState : null);

  if (!nativeCollector) return {};

  try {
    return nativeCollector();
  } catch (e) {
    console.error('[clawhome] Native state collector error:', e);
    return {};
  }
}
