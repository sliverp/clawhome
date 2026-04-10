import fs from 'fs'
import path from 'path'
import os from 'os'
import { MetricSnapshot } from './base.js'

interface Usage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens?: number
  cost?: { input?: number; output?: number }
}

interface MessageEntry {
  type: string
  message?: {
    role?: string
    model?: string
    provider?: string
    usage?: Usage
    stopReason?: string
    isError?: boolean
  }
}

interface SessionEntry {
  sessionId?: string
  status?: string
  model?: string
  modelProvider?: string
  contextTokens?: number
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens?: number
  totalTokensFresh?: number
  estimatedCostUsd?: number
  compactionCount?: number
  startedAt?: number
  endedAt?: number
  runtimeMs?: number
  updatedAt?: number
}

/**
 * Collect all available openclaw metrics by parsing:
 * - ~/.openclaw/agents/<agent>/sessions/sessions.json  (per-session summary)
 * - ~/.openclaw/agents/<agent>/sessions/*.jsonl         (per-message detail)
 */
export function collectOpenclawMetrics(): MetricSnapshot {
  const agentsDir = path.join(os.homedir(), '.openclaw', 'agents')
  if (!fs.existsSync(agentsDir)) return {}

  // ── Aggregated totals across all sessions ──────────────────────────────
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheRead = 0
  let totalCacheWrite = 0
  let totalCost = 0
  let totalCompactions = 0
  let totalRuntimeMs = 0
  let sessionCount = 0
  let errorCount = 0

  // Latest active session info
  let latestModel = ''
  let latestProvider = ''
  let latestContextTokens = 0
  let latestUpdatedAt = 0

  // Message-level counts
  let conversationCount = 0   // user turns
  let assistantTurns = 0
  let toolCallCount = 0
  let stopReasonErrors = 0

  let agentDirs: string[] = []
  try {
    agentDirs = fs.readdirSync(agentsDir).map((d) => path.join(agentsDir, d))
  } catch {
    return {}
  }

  for (const agentDir of agentDirs) {
    const sessionsDir = path.join(agentDir, 'sessions')
    if (!fs.existsSync(sessionsDir)) continue

    // ── Parse sessions.json for per-session summaries ──────────────────
    const sessionsIndex = path.join(sessionsDir, 'sessions.json')
    try {
      const idx = JSON.parse(fs.readFileSync(sessionsIndex, 'utf-8')) as Record<string, SessionEntry>
      sessionCount += Object.keys(idx).length

      for (const session of Object.values(idx)) {
        totalInputTokens += session.inputTokens ?? 0
        totalOutputTokens += session.outputTokens ?? 0
        totalCacheRead += session.cacheRead ?? 0
        totalCacheWrite += session.cacheWrite ?? 0
        totalCost += session.estimatedCostUsd ?? 0
        totalCompactions += session.compactionCount ?? 0
        totalRuntimeMs += session.runtimeMs ?? 0

        // Track latest active session for current model/context info
        const updated = session.updatedAt ?? 0
        if (updated > latestUpdatedAt) {
          latestUpdatedAt = updated
          latestModel = session.model ?? ''
          latestProvider = session.modelProvider ?? ''
          latestContextTokens = session.contextTokens ?? 0
        }
      }
    } catch { /* skip */ }

    // ── Parse JSONL for message-level metrics ─────────────────────────
    let jsonlFiles: string[] = []
    try {
      jsonlFiles = fs.readdirSync(sessionsDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(sessionsDir, f))
    } catch { continue }

    for (const jsonlFile of jsonlFiles) {
      try {
        const lines = fs.readFileSync(jsonlFile, 'utf-8').split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          const entry = JSON.parse(line) as MessageEntry
          if (entry.type !== 'message' || !entry.message) continue

          const { role, usage, isError, stopReason } = entry.message

          if (role === 'user') conversationCount++
          if (role === 'assistant') assistantTurns++
          if (role === 'toolResult') toolCallCount++
          if (isError) errorCount++
          if (stopReason === 'error') stopReasonErrors++

          // Message-level usage only used if sessions.json missing (fallback)
        }
      } catch { /* skip */ }
    }
  }

  const snapshot: MetricSnapshot = {}

  // Token metrics
  snapshot['token_input'] = totalInputTokens
  snapshot['token_output'] = totalOutputTokens
  snapshot['token_total'] = totalInputTokens + totalOutputTokens
  snapshot['token_cache_read'] = totalCacheRead
  snapshot['token_cache_write'] = totalCacheWrite
  snapshot['token_fresh'] = totalInputTokens - totalCacheRead  // non-cached input

  // Cost
  snapshot['cost_usd_total'] = Math.round(totalCost * 1_000_000) / 1_000_000

  // Session stats
  snapshot['session_count'] = sessionCount
  snapshot['compaction_count'] = totalCompactions
  snapshot['runtime_seconds'] = Math.floor(totalRuntimeMs / 1000)

  // Conversation stats
  snapshot['conversation_count'] = conversationCount
  snapshot['assistant_turns'] = assistantTurns
  snapshot['tool_call_count'] = toolCallCount
  snapshot['error_count'] = errorCount

  // Current session context
  snapshot['context_tokens'] = latestContextTokens
  if (latestContextTokens > 0 && totalInputTokens > 0) {
    // Cache hit ratio as percentage
    snapshot['cache_hit_pct'] = Math.round((totalCacheRead / Math.max(totalInputTokens, 1)) * 100 * 10) / 10
  }

  return snapshot
}
