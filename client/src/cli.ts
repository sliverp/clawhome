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

const program = new Command();

program
  .name("clawhome-client")
  .description("ClawHome Agent Monitor Client")
  .version("0.1.7");

// ── init command ──────────────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize and bind this agent to ClawHome dashboard")
  .requiredOption("--server <url>", "ClawHome server URL")
  .requiredOption("--token <token>", "Bind token from dashboard")
  .option("--type <type>", "Agent type override (skip auto-detection)")
  .action(async (opts: { server: string; token: string; type?: string }) => {
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

    // 5. Save configs
    const instanceConfig: InstanceConfig = {
      instanceId,
      serverUrl: opts.server,
      accessToken: null,
      bindToken: opts.token,
      localPort,
      agentType: detected.agentType,
      hostname: os.hostname(),
    };
    saveInstanceConfig(instanceId, instanceConfig);
    saveAgentConfig(instanceId, agentConfig);

    console.log(`[clawhome] Instance ID : ${instanceId}`);
    console.log(`[clawhome] Config dir  : ${clawhomeDir(instanceId)}`);
    console.log(`[clawhome] Local API   : 127.0.0.1:${localPort}`);

    // 6. Build the run command for the daemon
    const runCmd = `${process.execPath} ${__filename} run --instance ${instanceId}`;

    // 7. Register background service
    registerDaemon(instanceId, runCmd);

    // 8. Brief wait then verify
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
