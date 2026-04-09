import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { MetricsConfig, MetricSourceConfig } from "../config.js";
import { MetricSnapshot } from "./base.js";
import { collectSystemMetrics } from "./system.js";

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

export async function collectCustomMetrics(metricsConfig: MetricsConfig): Promise<MetricSnapshot> {
  const systemMetrics = await collectSystemMetrics();
  const snapshot: MetricSnapshot = { ...systemMetrics };

  await Promise.all(
    Object.entries(metricsConfig).map(async ([key, cfg]) => {
      // system metrics already collected
      if (cfg.source === "system") return;

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
