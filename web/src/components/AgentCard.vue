<template>
  <div class="agent-card card" :class="`status-${agent.status}`">
    <div class="card-header">
      <div class="agent-identity">
        <div class="agent-icon">{{ agentIcon }}</div>
        <div>
          <div class="agent-name">{{ agent.name }}</div>
          <div class="agent-host">{{ agent.hostname || '未知主机' }}</div>
        </div>
      </div>
      <span class="badge" :class="`badge-${agent.status}`">{{ statusLabel }}</span>
    </div>

    <div class="metrics-row" v-if="metrics && agent.status === 'online'">
      <div class="metric-item">
        <div class="metric-value">{{ metrics.metrics.cpu_percent?.toFixed(1) ?? '—' }}<span class="unit">%</span></div>
        <div class="metric-label">CPU</div>
      </div>
      <div class="metric-item">
        <div class="metric-value">{{ formatMemory(metrics.metrics.memory_mb) }}</div>
        <div class="metric-label">内存</div>
      </div>
      <div class="metric-item" v-if="metrics.metrics.token_count !== undefined">
        <div class="metric-value">{{ formatNumber(metrics.metrics.token_count) }}</div>
        <div class="metric-label">Tokens</div>
      </div>
      <div class="metric-item" v-if="metrics.metrics.conversation_count !== undefined">
        <div class="metric-value">{{ metrics.metrics.conversation_count }}</div>
        <div class="metric-label">对话</div>
      </div>
    </div>
    <div class="offline-hint" v-else-if="agent.status !== 'online'">
      上次在线：{{ formatLastSeen(agent.last_seen) }}
    </div>

    <div class="card-footer">
      <span class="agent-type-tag">{{ agent.agent_type }}</span>
      <span class="view-detail">查看详情 →</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Agent, MetricLatest } from '../api/index.js'

const props = defineProps<{ agent: Agent; metrics?: MetricLatest }>()

const agentIcon = computed(() => {
  const icons: Record<string, string> = { openclaw: '🦀', cursor: '🖱️', claude: '🤖', gemini: '✨', generic: '⚙️' }
  return icons[props.agent.agent_type] ?? '🤖'
})

const statusLabel = computed(() => ({
  online: '在线', offline: '离线', error: '异常',
}[props.agent.status] ?? props.agent.status))

function formatMemory(mb?: number) {
  if (mb === undefined) return '—'
  if (mb >= 1024) return (mb / 1024).toFixed(1) + 'GB'
  return mb.toFixed(0) + 'MB'
}

function formatNumber(n?: number) {
  if (n === undefined) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatLastSeen(ts: string | null) {
  if (!ts) return '从未'
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return d.toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.agent-card { cursor: pointer; transition: border-color .15s, transform .1s; user-select: none; }
.agent-card:hover { border-color: #6366f1; transform: translateY(-2px); }
.status-online { border-left: 3px solid #4ade80; }
.status-offline { border-left: 3px solid #374151; }
.status-error { border-left: 3px solid #ef4444; }

.card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.agent-identity { display: flex; align-items: center; gap: 10px; }
.agent-icon { font-size: 24px; }
.agent-name { font-size: 15px; font-weight: 600; }
.agent-host { font-size: 12px; color: #64748b; margin-top: 2px; }

.metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
.metric-item { text-align: center; background: #0f1117; border-radius: 8px; padding: 10px 4px; }
.metric-value { font-size: 17px; font-weight: 700; }
.unit { font-size: 12px; color: #94a3b8; }
.metric-label { font-size: 11px; color: #64748b; margin-top: 3px; }

.offline-hint { font-size: 13px; color: #64748b; margin-bottom: 16px; }

.card-footer { display: flex; align-items: center; justify-content: space-between; }
.agent-type-tag {
  font-size: 11px;
  background: #1e2235;
  border: 1px solid #2d3148;
  padding: 2px 8px;
  border-radius: 4px;
  color: #94a3b8;
}
.view-detail { font-size: 12px; color: #6366f1; }
</style>
