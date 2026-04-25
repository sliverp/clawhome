/**
 * OpenClaw openapi 插件安装器。
 *
 * 流程：
 * 1) 通过 `bash -lc which openclaw` 找到 openclaw CLI（或用 --openclaw-bin 显式传入）
 * 2) 检测插件是否已安装（看 ~/.openclaw/extensions/openclaw-openapi 是否存在）
 * 3) 未安装 → openclaw plugins install <vendor-path>
 * 4) 在 ~/.openclaw/openclaw.json 写入/读取 channel openapi 的 port + token
 * 5) 返回 { port, token } 给 client 使用
 *
 * 失败策略：任何关键步骤失败都抛出明确错误，由调用方决定打印/退出。
 */
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { executeCommand, executeCommandArgs } from "./executor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OpenApiInfo {
  port: number;
  token: string;
  host: string;        // 通常 127.0.0.1
}

const DEFAULT_PORT = 3210;
const DEFAULT_HOST = "127.0.0.1";
const PLUGIN_ID = "openclaw-openapi";

/**
 * 推断 vendor 目录（容忍开发态 src/ 与发布态 dist/）。
 * - dist/openapi-installer.js  → ../vendor/openclaw-openapi
 * - src/openapi-installer.ts   → ../vendor/openclaw-openapi
 */
export function getVendorPluginPath(): string {
  const candidates = [
    path.resolve(__dirname, "..", "vendor", PLUGIN_ID),
    path.resolve(__dirname, "..", "..", "vendor", PLUGIN_ID),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "openclaw.plugin.json"))) return c;
  }
  // 兜底返回第一个，调用方会自己报错
  return candidates[0];
}

/** openclaw 配置文件位置 */
function openclawConfigPath(): string {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

/** openclaw 已安装插件目录 */
function installedPluginDir(): string {
  return path.join(os.homedir(), ".openclaw", "extensions", PLUGIN_ID);
}

/** 找到 openclaw CLI 命令路径（用 login shell 的 PATH） */
export async function findOpenclawBinary(explicitPath?: string): Promise<string> {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`--openclaw-bin path does not exist: ${explicitPath}`);
    }
    return explicitPath;
  }
  // 用 login shell 的 PATH 找
  const r = await executeCommand("which openclaw");
  if (!r.success || !r.output.trim()) {
    throw new Error(
      "Cannot find 'openclaw' command. Make sure OpenClaw is installed and " +
      "available in your shell PATH (~/.bashrc / ~/.profile). " +
      "Or pass --openclaw-bin /full/path/to/openclaw."
    );
  }
  return r.output.trim().split("\n")[0]; // which 可能多行，取第一个
}

/** 调用 openclaw CLI（自动用绝对路径，避免 PATH 问题） */
async function runOpenclaw(openclawBin: string, args: string[]): Promise<string> {
  const r = await executeCommandArgs([openclawBin, ...args], 120_000);
  if (!r.success) {
    throw new Error(
      `openclaw ${args.join(" ")} failed:\n` + (r.error || "") +
      "\n--- stdout/stderr ---\n" + r.output
    );
  }
  return r.output;
}

/** 是否已经安装了 openapi 插件 */
export function isPluginInstalled(): boolean {
  const dir = installedPluginDir();
  return fs.existsSync(path.join(dir, "openclaw.plugin.json"));
}

/** 安装 vendor 里的 openapi 插件到 openclaw */
export async function installPlugin(openclawBin: string): Promise<void> {
  const vendor = getVendorPluginPath();
  if (!fs.existsSync(path.join(vendor, "openclaw.plugin.json"))) {
    throw new Error(`Bundled openclaw-openapi not found at ${vendor}`);
  }
  console.log(`[clawhome] Installing openclaw-openapi plugin from ${vendor} ...`);
  await runOpenclaw(openclawBin, ["plugins", "install", vendor]);
  console.log(`[clawhome] Plugin installed.`);
}

/** 读取 openclaw.json，没有则返回空对象 */
function readOpenclawConfig(): any {
  const p = openclawConfigPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse ${p}: ${(err as Error).message}`);
  }
}

/** 原子写回 openclaw.json */
function writeOpenclawConfig(cfg: any): void {
  const p = openclawConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

/**
 * 确保 openclaw.json 里有 channels.openapi 配置；
 * 如果没有就用随机生成的 token 写入；如果有就直接返回。
 */
export function ensureChannelConfigured(opts?: { port?: number; host?: string }): OpenApiInfo {
  const cfg = readOpenclawConfig();
  cfg.channels = cfg.channels || {};
  const ch = cfg.channels.openapi || {};
  const port = ch.port || opts?.port || DEFAULT_PORT;
  const host = ch.host || opts?.host || DEFAULT_HOST;
  let token: string = ch.token;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
  }
  const updated = {
    ...ch,             // 保留用户自定义字段
    enabled: true,     // 强制启用
    port,
    host,
    token,
  };
  cfg.channels.openapi = updated;
  writeOpenclawConfig(cfg);
  return { port, host, token };
}

/**
 * 一站式：装插件（已装则跳过）+ 写配置 + 重启 openclaw。
 * 返回连接信息。
 */
export async function setupOpenApi(opts: {
  openclawBin?: string;
  port?: number;
  host?: string;
  skipRestart?: boolean;
}): Promise<OpenApiInfo> {
  const bin = await findOpenclawBinary(opts.openclawBin);
  console.log(`[clawhome] Found openclaw at ${bin}`);

  if (isPluginInstalled()) {
    console.log(`[clawhome] openclaw-openapi plugin already installed.`);
  } else {
    await installPlugin(bin);
  }

  const info = ensureChannelConfigured({ port: opts.port, host: opts.host });
  console.log(
    `[clawhome] openapi channel configured: ${info.host}:${info.port} ` +
    `(token=${info.token.slice(0, 6)}…)`
  );

  if (!opts.skipRestart) {
    console.log(`[clawhome] Restarting openclaw to load plugin/config ...`);
    try {
      await runOpenclaw(bin, ["restart"]);
    } catch (err) {
      // restart 失败不致命：用户可能没启动 openclaw，下次启动自然会读取新配置
      console.warn(
        `[clawhome] openclaw restart failed (non-fatal): ${(err as Error).message}`
      );
    }
  }

  return info;
}
