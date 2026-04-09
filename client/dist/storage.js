import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
export function clawhomeDir(instanceId) {
    return path.join(os.homedir(), ".clawhome", instanceId);
}
export function loadAgentConfig(instanceId) {
    const file = path.join(clawhomeDir(instanceId), "agent-config.yaml");
    const raw = fs.readFileSync(file, "utf-8");
    return yaml.load(raw);
}
export function saveAgentConfig(instanceId, config) {
    const dir = clawhomeDir(instanceId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "agent-config.yaml");
    fs.writeFileSync(file, yaml.dump(config), "utf-8");
}
export function loadInstanceConfig(instanceId) {
    const file = path.join(clawhomeDir(instanceId), "config.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
}
export function saveInstanceConfig(instanceId, config) {
    const dir = clawhomeDir(instanceId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
}
export function listInstances() {
    const base = path.join(os.homedir(), ".clawhome");
    if (!fs.existsSync(base))
        return [];
    return fs.readdirSync(base).filter((d) => {
        const cfg = path.join(base, d, "config.json");
        return fs.existsSync(cfg);
    });
}
/**
 * Find a free TCP port starting from `start`.
 */
export async function findFreePort(start) {
    const net = await import("net");
    return new Promise((resolve, reject) => {
        const tryPort = (port) => {
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
//# sourceMappingURL=storage.js.map