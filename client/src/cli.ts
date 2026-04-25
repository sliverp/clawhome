#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { detectAgentType, generateInstanceName } from "./detector.js";
import {
  findFreePort,
  saveAgentConfig,
  saveInstanceConfig,
  listInstances,
  loadInstanceConfig,
  loadAgentConfig,
  clawhomeDir,
} from "./storage.js";
import { registerDaemon } from "./daemon.js";
import { ClawHomeClient } from "./client.js";
import { LocalApiServer } from "./local-api.js";
import { AgentConfig, InstanceConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从 package.json 读取版本号，避免代码里硬编码后与 npm 发布版本不一致
function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("clawhome-client")
  .description("ClawHome Agent Monitor Client")
  .version(readPackageVersion());

// ── init command ──────────────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize and bind this agent to ClawHome dashboard")
  .requiredOption("--server <url>", "ClawHome server URL")
  .requiredOption("--token <token>", "Bind token from dashboard")
  .option("--type <type>", "Agent type override (skip auto-detection)")
  .option("--openclaw-bin <path>", "Full path to openclaw CLI (override auto-detection)")
  .option("--skip-openapi", "Skip openclaw-openapi plugin install (chat will be unavailable)")
  .action(async (opts: {
    server: string; token: string; type?: string;
    openclawBin?: string; skipOpenapi?: boolean;
  }) => {
    console.log("[clawhome] Starting initialization...");

    // 1. Detect agent type
    const detected = opts.type
      ? { agentType: opts.type, templateName: opts.type }
      : detectAgentType();
    console.log(`[clawhome] Detected agent type: ${detected.agentType}`);

    // 2. Generate instance ID
    const crypto = await import("crypto");
    const instanceId = crypto.randomBytes(8).toString("hex");

    // 3. Find free port starting from 47321
    const localPort = await findFreePort(47321);

    // 4. Load template config
    const templatePath = path.join(__dirname, "..", "templates", `${detected.templateName}.yaml`);
    const fallbackPath = path.join(__dirname, "..", "templates", "generic.yaml");
    const tplPath = fs.existsSync(templatePath) ? templatePath : fallbackPath;
    const agentConfig = yaml.load(fs.readFileSync(tplPath, "utf-8")) as AgentConfig;
    agentConfig.agent_type = detected.agentType;

    // 5. 安装 openclaw-openapi 插件（让 chat 能力可用）
    let openapiInfo: { port: number; host: string; token: string } | undefined;
    if (opts.skipOpenapi) {
      console.log("[clawhome] --skip-openapi set, chat command will not be available.");
    } else {
      const { setupOpenApi } = await import("./openapi-installer.js");
      try {
        openapiInfo = await setupOpenApi({ openclawBin: opts.openclawBin });
      } catch (err) {
        console.error(
          "\n[clawhome] Failed to install openclaw-openapi plugin: " +
          (err instanceof Error ? err.message : String(err))
        );
        console.error("[clawhome] Aborting init. Re-run with --skip-openapi to bypass, or fix the issue and retry.");
        process.exit(1);
      }
    }

    // 6. Save configs
    const instanceConfig: InstanceConfig = {
      instanceId,
      serverUrl: opts.server,
      accessToken: null,
      bindToken: opts.token,
      localPort,
      agentType: detected.agentType,
      hostname: os.hostname(),
      ...(openapiInfo ? { openapi: openapiInfo } : {}),
    } as InstanceConfig;
    saveInstanceConfig(instanceId, instanceConfig);
    saveAgentConfig(instanceId, agentConfig);

    console.log(`[clawhome] Instance ID : ${instanceId}`);
    console.log(`[clawhome] Config dir  : ${clawhomeDir(instanceId)}`);
    console.log(`[clawhome] Local API   : 127.0.0.1:${localPort}`);
    if (openapiInfo) {
      console.log(`[clawhome] OpenAPI     : ${openapiInfo.host}:${openapiInfo.port}`);
    }

    // 7. Build the run command for the daemon
    const runCmd = `${process.execPath} ${__filename} run --instance ${instanceId}`;

    // 8. Register background service
    registerDaemon(instanceId, runCmd);

    // 9. Brief wait then verify
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const updated = loadInstanceConfig(instanceId);
      if (updated.accessToken) {
        console.log("\n[clawhome] Successfully bound and running!");
        console.log(`[clawhome] Name: ${generateInstanceName(detected.agentType)}`);
      } else {
        console.log("\n[clawhome] Background service started. Check your dashboard in a few seconds.");
      }
    } catch {
      console.log("[clawhome] Service started. Check your dashboard.");
    }
  });

// ── setup-openapi command (manual, after init failed) ────────────────────

program
  .command("setup-openapi")
  .description("Install/repair the openclaw-openapi plugin and write its connection info into an existing instance")
  .requiredOption("--instance <id>", "Instance ID to attach the openapi info to")
  .option("--openclaw-bin <path>", "Full path to openclaw CLI")
  .action(async (opts: { instance: string; openclawBin?: string }) => {
    const cfg = loadInstanceConfig(opts.instance) as InstanceConfig & {
      openapi?: { port: number; host: string; token: string };
    };
    const { setupOpenApi } = await import("./openapi-installer.js");
    try {
      const info = await setupOpenApi({ openclawBin: opts.openclawBin });
      cfg.openapi = info;
      saveInstanceConfig(opts.instance, cfg);
      console.log(
        `[clawhome] openapi configured for instance ${opts.instance}: ` +
        `${info.host}:${info.port}`
      );
    } catch (err) {
      console.error(
        "[clawhome] setup-openapi failed: " +
        (err instanceof Error ? err.message : String(err))
      );
      process.exit(1);
    }
  });

// ── run command (used by daemon/service) ─────────────────────────────────

program
  .command("run")
  .description("Run the client for a specific instance (internal use)")
  .requiredOption("--instance <id>", "Instance ID")
  .action(async (opts: { instance: string }) => {
    const instanceConfig = loadInstanceConfig(opts.instance);
    const agentConfig = loadAgentConfig(opts.instance);

    // Start local HTTP API
    const localApi = new LocalApiServer(instanceConfig.localPort);
    localApi.start();

    // Patch agentConfig so client merges local API metrics on each report cycle
    const { collectCustomMetrics: originalCollect } = await import("./collectors/custom.js");

    // Monkey-patch: wrap the collect function to also drain localApi
    const { ClawHomeClient: Client } = await import("./client.js");

    // We create a subclass that overrides metric collection to include local API data
    const client = new (class extends ClawHomeClient {
      protected override async collectMetrics() {
        const base = await originalCollect(agentConfig.metrics);
        const local = localApi.drainMetrics();
        return { ...base, ...local };
      }
    })(instanceConfig, agentConfig);

    client.start();

    const shutdown = () => {
      console.log("[clawhome] Shutting down...");
      client.stop();
      localApi.stop();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  });

// ── list command ──────────────────────────────────────────────────────────

program
  .command("list")
  .description("List all registered agent instances")
  .action(() => {
    const instances = listInstances();
    if (instances.length === 0) {
      console.log("No instances found.");
      console.log("Run: clawhome-client init --server <url> --token <token>");
      return;
    }
    console.log("Registered instances:");
    for (const id of instances) {
      try {
        const cfg = loadInstanceConfig(id);
        const status = cfg.accessToken ? "bound" : "pending";
        console.log(
          `  ${id}  type=${cfg.agentType}  port=${cfg.localPort}  status=${status}  server=${cfg.serverUrl}`
        );
      } catch {
        console.log(`  ${id}  (config unreadable)`);
      }
    }
  });

program.parse();
