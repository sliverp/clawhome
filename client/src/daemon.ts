import fs from "fs";
import os from "os";
import path from "path";
import { execSync, spawnSync } from "child_process";

/**
 * Register clawhome-client as a background service.
 * Tries: systemd → pm2 → nohup (last resort).
 */
export function registerDaemon(instanceId: string, startCmd: string): void {
  if (trySystemd(instanceId, startCmd)) return;
  if (tryPm2(instanceId, startCmd)) return;
  startNohup(instanceId, startCmd);
}

// ── systemd ───────────────────────────────────────────────────────────────

function trySystemd(instanceId: string, startCmd: string): boolean {
  if (os.platform() !== "linux") return false;
  try {
    execSync("systemctl --user status", { stdio: "pipe", timeout: 3000 });
  } catch {
    return false;
  }

  const serviceName = `clawhome-${instanceId}`;
  const unitDir = path.join(os.homedir(), ".config", "systemd", "user");
  fs.mkdirSync(unitDir, { recursive: true });

  const unit = `[Unit]
Description=ClawHome Agent Client (${instanceId})
After=network.target

[Service]
Type=simple
ExecStart=${startCmd}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
  fs.writeFileSync(path.join(unitDir, `${serviceName}.service`), unit, "utf-8");

  try {
    execSync("systemctl --user daemon-reload", { stdio: "pipe" });
    execSync(`systemctl --user enable --now ${serviceName}`, { stdio: "pipe" });
    console.log(`[clawhome] Registered systemd user service: ${serviceName}`);
    return true;
  } catch (e) {
    console.warn("[clawhome] systemd registration failed:", e);
    return false;
  }
}

// ── pm2 ───────────────────────────────────────────────────────────────────

function tryPm2(instanceId: string, startCmd: string): boolean {
  const result = spawnSync("pm2", ["--version"], { stdio: "pipe" });
  if (result.status !== 0) return false;

  try {
    execSync(`pm2 start "${startCmd}" --name clawhome-${instanceId}`, { stdio: "pipe" });
    execSync("pm2 save", { stdio: "pipe" });
    console.log(`[clawhome] Registered pm2 process: clawhome-${instanceId}`);
    return true;
  } catch (e) {
    console.warn("[clawhome] pm2 registration failed:", e);
    return false;
  }
}

// ── nohup fallback ────────────────────────────────────────────────────────

function startNohup(instanceId: string, startCmd: string): void {
  const logFile = path.join(os.homedir(), ".clawhome", instanceId, "clawhome.log");
  const pidFile = path.join(os.homedir(), ".clawhome", instanceId, "clawhome.pid");

  const result = spawnSync(
    "/bin/sh",
    ["-c", `nohup ${startCmd} >> "${logFile}" 2>&1 & echo $!`],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  const pid = result.stdout?.toString().trim();
  if (pid) {
    fs.writeFileSync(pidFile, pid, "utf-8");
    console.log(`[clawhome] Started with nohup (PID ${pid}). Log: ${logFile}`);
  } else {
    console.warn("[clawhome] Failed to start background process.");
  }
}
