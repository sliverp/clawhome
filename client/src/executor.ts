import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * 是否通过 login shell 执行命令。
 * 设为 true 后，所有命令都会走 `bash -lc "..."`，从而继承用户的 ~/.bashrc / ~/.profile
 * 里定义的 PATH、alias 之类环境（比如 nvm、pyenv 加进去的路径），解决 client 作为
 * 后台进程时找不到 openclaw 等工具的问题。
 *
 * 用环境变量 CLAWHOME_USE_LOGIN_SHELL=0 可以强制关闭（回到直接 execFile 的老行为）。
 */
const USE_LOGIN_SHELL = process.env.CLAWHOME_USE_LOGIN_SHELL !== "0";

/**
 * 把 parts 数组安全地拼成一个 shell 可以原样执行的字符串。
 * 每个参数都用单引号包住并转义内部的单引号，避免 shell 注入。
 */
function shellQuote(parts: string[]): string {
  return parts
    .map((p) => {
      // 空字符串 → ''
      if (p === "") return "''";
      // 不包含 shell 特殊字符时，可以不加引号
      if (/^[\w@%+=:,./\-]+$/.test(p)) return p;
      // 有特殊字符的走单引号转义
      return "'" + p.replace(/'/g, "'\"'\"'") + "'";
    })
    .join(" ");
}

/**
 * Execute a shell command defined in agent-config.yaml commands section.
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
    let stdout: string;
    let stderr: string;
    if (USE_LOGIN_SHELL) {
      // 用 login bash shell 执行，继承 ~/.bashrc / ~/.profile 定义的 PATH 等环境
      const script = shellQuote(parts);
      const result = await execFileAsync("bash", ["-lc", script], {
        timeout,
        // 允许较大的命令输出（openclaw chat 结果可能几十 KB）
        maxBuffer: 16 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } else {
      const result = await execFileAsync(bin, args, {
        timeout,
        maxBuffer: 16 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    }
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
