import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Execute a shell command defined in agent-config.yaml commands section.
 * The command string is split on spaces; no shell interpolation for safety.
 */
export async function executeCommand(commandStr: string): Promise<CommandResult> {
  const parts = commandStr.trim().split(/\s+/);
  return executeCommandArgs(parts);
}

export async function executeCommandArgs(parts: string[], timeout = 30_000): Promise<CommandResult> {
  const [bin, ...args] = parts;
  if (!bin) {
    return { success: false, output: "", error: "Empty command" };
  }

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout });
    return { success: true, output: (stdout + stderr).trim() };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      output: ((e.stdout ?? "") + (e.stderr ?? "")).trim(),
      error: e.message ?? String(err),
    };
  }
}
