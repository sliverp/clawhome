import { execSync, spawnSync } from "child_process";
import os from "os";
const KNOWN_AGENTS = [
    { bin: "openclaw", agentType: "openclaw" },
    { bin: "cursor", agentType: "cursor" },
    { bin: "claude", agentType: "claude" },
    { bin: "gemini", agentType: "gemini" },
];
function commandExists(cmd) {
    try {
        const which = os.platform() === "win32" ? "where" : "which";
        const result = spawnSync(which, [cmd], { stdio: "pipe" });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
function runningProcesses() {
    try {
        if (os.platform() === "win32") {
            return execSync("tasklist /fo csv /nh", { stdio: "pipe", timeout: 3000 }).toString();
        }
        return execSync("ps aux", { stdio: "pipe", timeout: 3000 }).toString();
    }
    catch {
        return "";
    }
}
export function detectAgentType() {
    // 1. Check if binary exists in PATH
    for (const { bin, agentType } of KNOWN_AGENTS) {
        if (commandExists(bin)) {
            return { agentType, templateName: agentType };
        }
    }
    // 2. Fallback: check running processes
    const procs = runningProcesses().toLowerCase();
    for (const { bin, agentType } of KNOWN_AGENTS) {
        if (procs.includes(bin)) {
            return { agentType, templateName: agentType };
        }
    }
    return { agentType: "generic", templateName: "generic" };
}
export function generateInstanceName(agentType) {
    const hostname = os.hostname().replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
    return `${hostname}-${agentType}`;
}
//# sourceMappingURL=detector.js.map