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
    usage?: Usage
  }
}

/**
 * Collect metrics by parsing openclaw session JSONL files directly.
 * Data path: ~/.openclaw/agents/<agent>/sessions/*.jsonl
 */
export function collectOpenclawMetrics(): MetricSnapshot {
  const agentsDir = path.join(os.homedir(), '.openclaw', 'agents')
  if (!fs.existsSync(agentsDir)) return {}

  let totalInput = 0
  let totalOutput = 0
  let totalCacheRead = 0
  let totalCost = 0
  let conversationCount = 0
  let sessionCount = 0

  // Walk all agents' session directories
  let agentDirs: string[] = []
  try {
    agentDirs = fs.readdirSync(agentsDir).map((d) => path.join(agentsDir, d))
  } catch {
    return {}
  }

  for (const agentDir of agentDirs) {
    const sessionsDir = path.join(agentDir, 'sessions')
    if (!fs.existsSync(sessionsDir)) continue

    // Count sessions from sessions.json
    const sessionsIndex = path.join(sessionsDir, 'sessions.json')
    try {
      const idx = JSON.parse(fs.readFileSync(sessionsIndex, 'utf-8'))
      sessionCount += Object.keys(idx).length
    } catch { /* skip */ }

    // Parse each .jsonl file
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

          const { role, usage } = entry.message
          if (role === 'user') conversationCount++
          if (!usage) continue

          totalInput += usage.input ?? 0
          totalOutput += usage.output ?? 0
          totalCacheRead += usage.cacheRead ?? 0
          const cost = usage.cost ?? {}
          totalCost += (cost.input ?? 0) + (cost.output ?? 0)
        }
      } catch { /* skip malformed file */ }
    }
  }

  return {
    token_input: totalInput,
    token_output: totalOutput,
    token_cache_read: totalCacheRead,
    token_total: totalInput + totalOutput,
    conversation_count: conversationCount,
    session_count: sessionCount,
    cost_usd_total: Math.round(totalCost * 1_000_000) / 1_000_000,
  }
}
