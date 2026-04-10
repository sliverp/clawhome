import fs from 'fs'
import path from 'path'
import os from 'os'
import { MetricSnapshot, StateSnapshot } from './base.js'

interface Usage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens?: number
  cost?: { input?: number; output?: number }
}

interface MessageContentEntry {
  type?: string
  text?: string
}

interface MessageEntry {
  type: string
  isError?: boolean
  message?: {
    role?: string
    model?: string
    provider?: string
    usage?: Usage
    stopReason?: string
    isError?: boolean
    content?: MessageContentEntry[]
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

interface OpenclawConfig {
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>
  }
  channels?: Record<string, { enabled?: boolean }>
}

interface ChannelDetail {
  enabled: boolean
  started: boolean
  message_count: number
}

function normalizeMetricKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function countJsonlLines(filePath: string): number {
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n').filter((line) => line.trim()).length
  } catch {
    return 0
  }
}

function collectConfiguredState() {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenclawConfig
    const configuredPlugins = Object.keys(config.plugins?.entries ?? {})
    const enabledPlugins = configuredPlugins.filter((name) => config.plugins?.entries?.[name]?.enabled !== false)
    const configuredChannels = Object.keys(config.channels ?? {})
    const enabledChannels = configuredChannels.filter((name) => config.channels?.[name]?.enabled !== false)

    return {
      configuredPlugins,
      enabledPlugins,
      configuredChannels,
      enabledChannels,
    }
  } catch {
    return {
      configuredPlugins: [] as string[],
      enabledPlugins: [] as string[],
      configuredChannels: [] as string[],
      enabledChannels: [] as string[],
    }
  }
}

function collectChannelEvidence(enabledChannels: string[]) {
  const startedChannels = new Set<string>()
  const channelMessageCounts: Record<string, number> = {}

  const qqbotSession = path.join(os.homedir(), '.openclaw', 'qqbot', 'sessions', 'session-default.json')
  if (enabledChannels.includes('qqbot') && fs.existsSync(qqbotSession)) {
    startedChannels.add('qqbot')
  }

  const qqbotRefIndex = path.join(os.homedir(), '.openclaw', 'qqbot', 'data', 'ref-index.jsonl')
  if (enabledChannels.includes('qqbot') && fs.existsSync(qqbotRefIndex)) {
    channelMessageCounts.qqbot = countJsonlLines(qqbotRefIndex)
  }

  const fallbackMessageCounts: Record<string, number> = {}
  const agentsDir = path.join(os.homedir(), '.openclaw', 'agents')
  if (fs.existsSync(agentsDir)) {
    for (const agentName of fs.readdirSync(agentsDir)) {
      const sessionsDir = path.join(agentsDir, agentName, 'sessions')
      if (!fs.existsSync(sessionsDir)) continue
      for (const fileName of fs.readdirSync(sessionsDir).filter((name) => name.endsWith('.jsonl'))) {
        const filePath = path.join(sessionsDir, fileName)
        try {
          const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
          for (const line of lines) {
            if (!line.trim()) continue
            const entry = JSON.parse(line) as MessageEntry
            const content = entry.message?.content ?? []
            for (const item of content) {
              if (item.type !== 'text' || !item.text) continue
              const match = item.text.match(/\[([^\]]+)\]\s+to=([a-z0-9_-]+):/i)
              if (!match) continue
              const channelKey = normalizeMetricKey(match[2])
              fallbackMessageCounts[channelKey] = (fallbackMessageCounts[channelKey] ?? 0) + 1
              startedChannels.add(channelKey)
            }
          }
        } catch {
          continue
        }
      }
    }
  }

  for (const channelName of enabledChannels) {
    if (!(channelName in channelMessageCounts) && fallbackMessageCounts[channelName] !== undefined) {
      channelMessageCounts[channelName] = fallbackMessageCounts[channelName]
    }
  }

  return { startedChannels: Array.from(startedChannels), channelMessageCounts }
}

/**
 * Collect all available openclaw metrics by parsing:
 * - ~/.openclaw/agents/<agent>/sessions/sessions.json  (per-session summary)
 * - ~/.openclaw/agents/<agent>/sessions/*.jsonl         (per-message detail)
 */
export function collectOpenclawMetrics(): MetricSnapshot {
  const agentsDir = path.join(os.homedir(), '.openclaw', 'agents')
  if (!fs.existsSync(agentsDir)) return {}
  const { enabledPlugins, enabledChannels } = collectConfiguredState()
  const { startedChannels, channelMessageCounts } = collectChannelEvidence(enabledChannels)

  // ── Aggregated totals across all sessions ──────────────────────────────
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokens = 0
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
        totalTokens += session.totalTokens ?? ((session.inputTokens ?? 0) + (session.outputTokens ?? 0))
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

          const { role, isError, stopReason, content } = entry.message

          if (role === 'user') conversationCount++
          if (role === 'assistant') assistantTurns++
          if (role === 'assistant') {
            toolCallCount += (content ?? []).filter((item) => item.type === 'toolCall').length
          }
          if (entry.isError || isError || stopReason === 'error') errorCount++

          // Message-level usage only used if sessions.json missing (fallback)
        }
      } catch { /* skip */ }
    }
  }

  const snapshot: MetricSnapshot = {}

  // Token metrics
  snapshot['token_input'] = totalInputTokens
  snapshot['token_output'] = totalOutputTokens
  snapshot['token_total'] = totalTokens
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

  snapshot['plugin_count'] = enabledPlugins.length
  snapshot['channel_count'] = enabledChannels.length
  snapshot['channel_started_count'] = startedChannels.length
  for (const pluginName of enabledPlugins) {
    snapshot[`plugin_enabled_${normalizeMetricKey(pluginName)}`] = 1
  }
  for (const channelName of enabledChannels) {
    snapshot[`channel_enabled_${normalizeMetricKey(channelName)}`] = 1
  }
  for (const channelName of startedChannels) {
    snapshot[`channel_started_${normalizeMetricKey(channelName)}`] = 1
  }
  for (const [channelName, count] of Object.entries(channelMessageCounts)) {
    snapshot[`channel_message_count_${normalizeMetricKey(channelName)}`] = count
  }

  return snapshot
}

export function collectOpenclawState(): StateSnapshot {
  const { configuredPlugins, enabledPlugins, configuredChannels, enabledChannels } = collectConfiguredState()
  const { startedChannels, channelMessageCounts } = collectChannelEvidence(enabledChannels)
  const details: Record<string, ChannelDetail> = {}

  for (const channelName of configuredChannels) {
    details[channelName] = {
      enabled: enabledChannels.includes(channelName),
      started: startedChannels.includes(channelName),
      message_count: channelMessageCounts[channelName] ?? 0,
    }
  }

  return {
    openclaw: {
      plugins: {
        configured: configuredPlugins,
        enabled: enabledPlugins,
      },
      channels: {
        configured: configuredChannels,
        enabled: enabledChannels,
        started: startedChannels,
        message_counts: channelMessageCounts,
        details,
      },
    },
  }
}
