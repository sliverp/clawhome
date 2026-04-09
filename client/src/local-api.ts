import http from "http";
import { MetricSnapshot } from "./collectors/base.js";

/**
 * Local HTTP API server on 127.0.0.1:<port>.
 *
 * Agent processes can POST metrics to this server:
 *   POST /metrics  Body: {"token_count": 100, "conversation_count": 5}
 *
 * The reported metrics are merged into the next WebSocket report cycle.
 */
export class LocalApiServer {
  private server: http.Server | null = null;
  private pendingMetrics: MetricSnapshot = {};

  constructor(private port: number) {}

  start(): void {
    this.server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/metrics") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const data = JSON.parse(body) as Record<string, unknown>;
            for (const [k, v] of Object.entries(data)) {
              if (typeof v === "number") this.pendingMetrics[k] = v;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "invalid JSON" }));
          }
        });
      } else if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.server.listen(this.port, "127.0.0.1", () => {
      console.log(`[clawhome] Local API listening on 127.0.0.1:${this.port}`);
    });
  }

  stop(): void {
    this.server?.close();
  }

  /**
   * Drain and return all metrics received since last call.
   */
  drainMetrics(): MetricSnapshot {
    const snapshot = { ...this.pendingMetrics };
    this.pendingMetrics = {};
    return snapshot;
  }
}
