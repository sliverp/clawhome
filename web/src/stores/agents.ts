import { defineStore } from 'pinia'
import { ref } from 'vue'
import { agentsApi, metricsApi, type Agent, type CommandResultEvent, type MetricLatest, type MetricDefinition } from '../api/index.js'
import { useAuthStore } from './auth.js'

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<Agent[]>([])
  const latestMetrics = ref<Record<number, MetricLatest>>({})
  const definitions = ref<MetricDefinition[]>([])
  const commandResults = ref<Record<string, CommandResultEvent>>({})
  let ws: WebSocket | null = null

  async function fetchAgents() {
    const res = await agentsApi.list()
    agents.value = res.data
  }

  async function fetchLatest(agentId: number) {
    const res = await metricsApi.latest(agentId)
    latestMetrics.value[agentId] = res.data
  }

  async function fetchDefinitions(agentType: string) {
    const res = await metricsApi.definitions(agentType)
    definitions.value = res.data
  }

  function connectDashboardWS() {
    const authStore = useAuthStore()
    if (!authStore.token) return

    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
    const wsUrl = base.replace(/^http/, 'ws') + `/ws/dashboard?token=${authStore.token}`
    ws = new WebSocket(wsUrl)

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg.type === 'agent_status') {
          const { agent_id, status } = msg.data as { agent_id: number; status: string }
          const agent = agents.value.find((a) => a.id === agent_id)
          if (agent) agent.status = status as Agent['status']
        } else if (msg.type === 'agent_metrics') {
          const { agent_id, metrics } = msg.data as { agent_id: number; metrics: Record<string, number> }
          if (!latestMetrics.value[agent_id]) {
            latestMetrics.value[agent_id] = { agent_id, metrics: {}, recorded_at: null }
          }
          latestMetrics.value[agent_id].metrics = {
            ...latestMetrics.value[agent_id].metrics,
            ...metrics,
          }
          latestMetrics.value[agent_id].recorded_at = new Date().toISOString()
        } else if (msg.type === 'command_result') {
          const result = msg.data as CommandResultEvent
          commandResults.value[result.request_id] = result
        }
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      // Reconnect after 5s
      setTimeout(() => {
        if (authStore.isLoggedIn) connectDashboardWS()
      }, 5000)
    }

    // Heartbeat every 30s
    const hb = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      } else {
        clearInterval(hb)
      }
    }, 30000)
  }

  function disconnectWS() {
    ws?.close()
    ws = null
  }

  return {
    agents,
    latestMetrics,
    definitions,
    commandResults,
    fetchAgents,
    fetchLatest,
    fetchDefinitions,
    connectDashboardWS,
    disconnectWS,
  }
})
