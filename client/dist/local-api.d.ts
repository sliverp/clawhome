import { MetricSnapshot } from "./collectors/base.js";
/**
 * Local HTTP API server on 127.0.0.1:<port>.
 *
 * Agent processes can POST metrics to this server:
 *   POST /metrics  Body: {"token_count": 100, "conversation_count": 5}
 *
 * The reported metrics are merged into the next WebSocket report cycle.
 */
export declare class LocalApiServer {
    private port;
    private server;
    private pendingMetrics;
    constructor(port: number);
    start(): void;
    stop(): void;
    /**
     * Drain and return all metrics received since last call.
     */
    drainMetrics(): MetricSnapshot;
}
//# sourceMappingURL=local-api.d.ts.map