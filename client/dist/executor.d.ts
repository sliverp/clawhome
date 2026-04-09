export interface CommandResult {
    success: boolean;
    output: string;
    error?: string;
}
/**
 * Execute a shell command defined in agent-config.yaml commands section.
 * The command string is split on spaces; no shell interpolation for safety.
 */
export declare function executeCommand(commandStr: string): Promise<CommandResult>;
//# sourceMappingURL=executor.d.ts.map