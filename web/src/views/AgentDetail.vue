<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">ClawHome</span>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/dashboard" class="nav-item">← 返回总览</router-link>
      </nav>
    </aside>

    <main class="main" v-if="agent">
      <!-- Header -->
      <div class="page-header">
        <div class="agent-identity">
          <div class="agent-icon">{{ agentIcon }}</div>
          <div>
            <div class="agent-name-row">
              <h1 class="agent-name" v-if="!renaming">{{ agent.name }}</h1>
              <input v-else v-model="newName" class="form-input rename-input" @keyup.enter="submitRename" @keyup.escape="renaming = false" />
              <button class="btn btn-ghost btn-sm" @click="toggleRename">{{ renaming ? '取消' : '重命名' }}</button>
              <button v-if="renaming" class="btn btn-primary btn-sm" @click="submitRename">保存</button>
            </div>
            <div class="agent-meta">
              <span class="badge" :class="`badge-${agent.status}`">{{ statusLabel }}</span>
              <span class="meta-sep">·</span>
              <span class="meta-text">{{ agent.agent_type }}</span>
              <span class="meta-sep">·</span>
              <span class="meta-text">{{ agent.hostname || '未知主机' }}</span>
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="header-actions">
          <button
            class="btn btn-ghost btn-sm"
            :disabled="agent.status !== 'online' || commandPending"
            @click="refreshAgent"
          >
            立即刷新
          </button>
          <button
            v-for="cmd in availableCommands"
            :key="cmd"
            class="btn btn-ghost btn-sm"
            :disabled="agent.status !== 'online' || commandPending"
            @click="sendCommand(cmd)"
          >
            {{ cmdLabel(cmd) }}
          </button>
          <button class="btn btn-danger btn-sm" @click="confirmDelete">删除</button>
        </div>
      </div>

      <!-- Command feedback -->
      <div v-if="cmdFeedback" class="cmd-feedback" :class="cmdFeedback.success ? 'success' : 'error'">
        {{ cmdFeedback.message }}
      </div>

      <!-- Latest metric cards -->
      <div class="metrics-grid" v-if="latestMetrics">
        <div class="metric-card card" v-for="def in shownDefinitions" :key="def.metric_key">
          <div class="metric-card-label">{{ def.display_name }}</div>
          <div class="metric-card-value">
            {{ formatValue(latestMetrics.metrics[def.metric_key], def) }}
            <span class="metric-card-unit" v-if="def.unit">{{ def.unit }}</span>
          </div>
        </div>
      </div>

      <section v-if="openclawMeta" class="status-section">
        <h2 class="section-title">OpenClaw 状态</h2>
        <div class="status-grid">
          <div class="status-card card">
            <div class="status-card-title">已启用插件</div>
            <div v-if="enabledPlugins.length" class="tag-list">
              <span v-for="plugin in enabledPlugins" :key="`enabled-plugin-${plugin}`" class="status-tag">{{ plugin }}</span>
            </div>
            <div v-else class="status-empty">暂无数据</div>
          </div>
          <div class="status-card card">
            <div class="status-card-title">已配置插件</div>
            <div v-if="configuredPlugins.length" class="tag-list">
              <span v-for="plugin in configuredPlugins" :key="`configured-plugin-${plugin}`" class="status-tag muted">{{ plugin }}</span>
            </div>
            <div v-else class="status-empty">暂无数据</div>
          </div>
          <div class="status-card card">
            <div class="status-card-title">Channel 状态</div>
            <div v-if="channelRows.length" class="channel-list">
              <div v-for="channel in channelRows" :key="channel.name" class="channel-row">
                <div class="channel-head">
                  <span class="channel-name">{{ channel.name }}</span>
                  <span class="channel-count">{{ channel.messageCount }} 次</span>
                </div>
                <div class="tag-list">
                  <span class="status-tag" :class="channel.enabled ? 'ok' : 'muted'">
                    {{ channel.enabled ? '已启用' : '未启用' }}
                  </span>
                  <span class="status-tag" :class="channel.started ? 'ok' : 'muted'">
                    {{ channel.started ? '已启动' : '未启动' }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="status-empty">暂无数据</div>
          </div>
        </div>
      </section>

      <!-- Charts -->
      <div class="charts-section" v-if="shownDefinitions.length">
        <h2 class="section-title">历史趋势</h2>
        <div class="charts-grid">
          <div
            v-for="def in lineDefinitions"
            :key="`chart-${def.metric_key}`"
            class="chart-wrap card"
          >
            <div class="chart-title">{{ def.display_name }}</div>
            <MetricChart :history="history[def.metric_key] || []" :unit="def.unit || ''" :color="chartColor(def.metric_key)" />
          </div>
        </div>
      </div>
    </main>

    <main class="main loading-main" v-else>
      <div class="loading">加载中…</div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAgentsStore } from '../stores/agents.js'
import { agentsApi, metricsApi, type Agent, type MetricDefinition, type MetricPoint, type OpenClawMetadata } from '../api/index.js'
import MetricChart from '../components/MetricChart.vue'

const route = useRoute()
const router = useRouter()
const agentsStore = useAgentsStore()

const agentId = Number(route.params.id)
const agent = ref<Agent | null>(null)
const renaming = ref(false)
const newName = ref('')
const commandPending = ref(false)
const cmdFeedback = ref<{ success: boolean; message: string } | null>(null)
const history = ref<Record<string, MetricPoint[]>>({})

const latestMetrics = computed(() => agentsStore.latestMetrics[agentId])
const definitions = computed(() => agentsStore.definitions)
const openclawMeta = computed<OpenClawMetadata | null>(() => agent.value?.metadata_?.openclaw ?? null)
const enabledPlugins = computed(() => openclawMeta.value?.plugins?.enabled ?? [])
const configuredPlugins = computed(() => openclawMeta.value?.plugins?.configured ?? [])
const channelRows = computed(() => {
  const details = openclawMeta.value?.channels?.details ?? {}
  return Object.entries(details).map(([name, detail]) => ({
    name,
    enabled: detail.enabled,
    started: detail.started,
    messageCount: detail.message_count,
  }))
})

const COLORS: Record<string, string> = {
  cpu_percent: '#6366f1',
  memory_mb: '#22d3ee',
  token_count: '#a78bfa',
  conversation_count: '#34d399',
  uptime: '#f59e0b',
}

const shownDefinitions = computed(() =>
  definitions.value.filter((d) => latestMetrics.value?.metrics[d.metric_key] !== undefined)
)
const lineDefinitions = computed(() =>
  shownDefinitions.value.filter((d) => d.chart_type === 'line')
)

const agentIcon = computed(() => {
  const icons: Record<string, string> = { openclaw: '🦀', cursor: '🖱️', claude: '🤖', gemini: '✨', generic: '⚙️' }
  return icons[agent.value?.agent_type ?? ''] ?? '🤖'
})

const statusLabel = computed(() => ({
  online: '在线', offline: '离线', error: '异常',
}[agent.value?.status ?? 'offline']))

const availableCommands = ['restart', 'stop', 'start']

function cmdLabel(cmd: string): string {
  return { restart: '重启', stop: '停止', start: '启动' }[cmd] ?? cmd
}

function chartColor(key: string): string {
  return COLORS[key] ?? '#6366f1'
}

function formatValue(v: number | undefined, def: MetricDefinition): string {
  if (v === undefined) return '—'
  if (def.metric_key === 'memory_mb') {
    return v >= 1024 ? (v / 1024).toFixed(1) : v.toFixed(0)
  }
  if (def.unit === '%') return v.toFixed(1)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return v.toFixed(0)
}

async function sendCommand(cmd: string) {
  commandPending.value = true
  cmdFeedback.value = null
  try {
    await agentsApi.sendCommand(agentId, cmd)
    cmdFeedback.value = { success: true, message: `已发送「${cmdLabel(cmd)}」命令，等待执行结果…` }
  } catch {
    cmdFeedback.value = { success: false, message: '命令发送失败，请检查 Agent 连接状态' }
  } finally {
    commandPending.value = false
    setTimeout(() => (cmdFeedback.value = null), 5000)
  }
}

async function refreshAgent() {
  commandPending.value = true
  cmdFeedback.value = null
  try {
    await agentsApi.refresh(agentId)
    cmdFeedback.value = { success: true, message: '已发送刷新命令，正在请求 Agent 立即上报…' }
    setTimeout(async () => {
      await agentsStore.fetchLatest(agentId)
      const res = await agentsApi.get(agentId)
      agent.value = res.data
    }, 1500)
  } catch {
    cmdFeedback.value = { success: false, message: '刷新命令发送失败，请检查 Agent 连接状态' }
  } finally {
    commandPending.value = false
    setTimeout(() => (cmdFeedback.value = null), 5000)
  }
}

function toggleRename() {
  if (!renaming.value) {
    newName.value = agent.value?.name ?? ''
  }
  renaming.value = !renaming.value
}

async function submitRename() {
  if (!newName.value.trim() || !agent.value) return
  try {
    const res = await agentsApi.rename(agentId, newName.value.trim())
    agent.value = res.data
    renaming.value = false
    await agentsStore.fetchAgents()
  } catch { /* ignore */ }
}

async function confirmDelete() {
  if (!confirm(`确认删除 Agent「${agent.value?.name}」？此操作不可撤销。`)) return
  await agentsApi.delete(agentId)
  router.push('/dashboard')
}

async function loadHistory() {
  if (!agent.value) return
  const defs = definitions.value.filter((d) => d.chart_type === 'line')
  await Promise.all(
    defs.map(async (d) => {
      const res = await metricsApi.history(agentId, { metric_key: d.metric_key, limit: 100 })
      history.value[d.metric_key] = res.data.reverse()
    })
  )
}

onMounted(async () => {
  const res = await agentsApi.get(agentId)
  agent.value = res.data
  await agentsStore.fetchDefinitions(agent.value.agent_type)
  await agentsStore.fetchLatest(agentId)
  await loadHistory()
  agentsStore.connectDashboardWS()
})

onUnmounted(() => agentsStore.disconnectWS())
</script>

<style scoped>
.layout { display: flex; min-height: 100vh; }
.sidebar {
  width: 240px; flex-shrink: 0;
  background: #13152a; border-right: 1px solid #2d3148;
  display: flex; flex-direction: column; padding: 20px 16px;
}
.sidebar-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 32px; padding: 0 8px; }
.logo-icon { font-size: 20px; }
.logo-text { font-size: 18px; font-weight: 700; color: #6366f1; }
.nav-item { display: block; padding: 9px 12px; border-radius: 8px; font-size: 14px; color: #94a3b8; }
.nav-item:hover { background: #1e2235; color: #e2e8f0; }

.main { flex: 1; padding: 32px 36px; overflow-y: auto; }
.loading-main { display: flex; align-items: center; justify-content: center; }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; gap: 16px; }
.agent-identity { display: flex; align-items: center; gap: 14px; }
.agent-icon { font-size: 36px; }
.agent-name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.agent-name { font-size: 22px; font-weight: 700; }
.rename-input { font-size: 18px; padding: 6px 10px; width: 280px; }
.agent-meta { display: flex; align-items: center; gap: 6px; }
.meta-sep { color: #374151; }
.meta-text { font-size: 13px; color: #64748b; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.btn-sm { padding: 6px 12px; font-size: 13px; }

.cmd-feedback {
  padding: 10px 14px; border-radius: 8px;
  font-size: 13px; margin-bottom: 20px;
}
.cmd-feedback.success { background: #14532d22; border: 1px solid #166534; color: #4ade80; }
.cmd-feedback.error { background: #450a0a22; border: 1px solid #7f1d1d; color: #f87171; }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 32px;
}
.metric-card { text-align: center; padding: 20px 16px; }
.metric-card-label { font-size: 12px; color: #64748b; margin-bottom: 10px; }
.metric-card-value { font-size: 28px; font-weight: 700; }
.metric-card-unit { font-size: 14px; color: #94a3b8; margin-left: 3px; }

.status-section { margin-bottom: 32px; }
.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.status-card { padding: 20px; }
.status-card-title { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; }
.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #1e2235;
  border: 1px solid #2d3148;
  color: #dbe4ff;
  font-size: 12px;
}
.status-tag.ok {
  background: #113126;
  border-color: #166534;
  color: #86efac;
}
.status-tag.muted {
  color: #94a3b8;
}
.status-empty { color: #64748b; font-size: 13px; }
.channel-list { display: flex; flex-direction: column; gap: 12px; }
.channel-row {
  background: #0f1117;
  border: 1px solid #2d3148;
  border-radius: 10px;
  padding: 12px;
}
.channel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 12px;
}
.channel-name { font-size: 14px; font-weight: 600; }
.channel-count { font-size: 12px; color: #94a3b8; }

.section-title { font-size: 17px; font-weight: 600; margin-bottom: 16px; }
.charts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 16px; }
.chart-wrap { padding: 20px; }
.chart-title { font-size: 13px; color: #94a3b8; margin-bottom: 14px; }
</style>
