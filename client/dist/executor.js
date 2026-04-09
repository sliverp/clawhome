import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
/**
 * Execute a shell command defined in agent-config.yaml commands section.
 * The command string is split on spaces; no shell interpolation for safety.
 */
export async function executeCommand(commandStr) {
    const parts = commandStr.trim().split(/\s+/);
    const [bin, ...args] = parts;
    if (!bin) {
        return { success: false, output: "", error: "Empty command" };
    }
    try {
        const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 30_000 });
        return { success: true, output: (stdout + stderr).trim() };
    }
    catch (err) {
        const e = err;
        return {
            success: false,
            output: ((e.stdout ?? "") + (e.stderr ?? "")).trim(),
            error: e.message ?? String(err),
        };
    }
}
//# sourceMappingURL=executor.js.map