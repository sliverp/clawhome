import si from "systeminformation";
let startTime = Date.now();
export async function collectSystemMetrics() {
    const [cpu, mem] = await Promise.all([si.currentLoad(), si.mem()]);
    return {
        cpu_percent: Math.round(cpu.currentLoad * 10) / 10,
        memory_mb: Math.round(mem.used / 1024 / 1024),
        uptime: Math.floor((Date.now() - startTime) / 1000),
    };
}
//# sourceMappingURL=system.js.map