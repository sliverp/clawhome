import axios from 'axios'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 10000,
})

// Attach JWT token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to login on 401
http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default http

// ── Auth ────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    http.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    http.post<{ access_token: string; token_type: string }>('/auth/login', data),
  me: () => http.get('/auth/me'),
}

// ── Agents ───────────────────────────────────────────────────────────────
export const agentsApi = {
  list: () => http.get<Agent[]>('/agents'),
  create: (data: { name?: string }) => http.post<AgentInstallInfo>('/agents', data),
  get: (id: number) => http.get<Agent>(`/agents/${id}`),
  rename: (id: number, name: string) => http.patch<Agent>(`/agents/${id}/name`, { name }),
  delete: (id: number) => http.delete(`/agents/${id}`),
  sendCommand: (id: number, cmd: string) =>
    http.post<{ request_id: string; status: string }>(`/agents/${id}/command`, { cmd }),
  refresh: (id: number) =>
    http.post<{ request_id: string; status: string }>(`/agents/${id}/refresh`),
}

// ── Metrics ──────────────────────────────────────────────────────────────
export const metricsApi = {
  history: (agentId: number, params?: { metric_key?: string; start?: string; end?: string; limit?: number }) =>
    http.get<MetricPoint[]>(`/agents/${agentId}/metrics`, { params }),
  latest: (agentId: number) =>
    http.get<MetricLatest>(`/agents/${agentId}/metrics/latest`),
  definitions: (agentType?: string) =>
    http.get<MetricDefinition[]>('/metric-definitions', { params: agentType ? { agent_type: agentType } : {} }),
}

// ── Types ────────────────────────────────────────────────────────────────
export interface Agent {
  id: number
  instance_id: string
  name: string
  agent_type: string
  hostname: string | null
  status: 'offline' | 'online' | 'error'
  last_seen: string | null
  local_port: number | null
  created_at: string
  install_url: string | null
}

export interface AgentInstallInfo {
  agent: Agent
  install_url: string
  prompt: string
}

export interface MetricPoint {
  metric_key: string
  value: number
  extra: unknown
  recorded_at: string
}

export interface MetricLatest {
  agent_id: number
  metrics: Record<string, number>
  recorded_at: string | null
}

export interface MetricDefinition {
  id: number
  agent_type: string
  metric_key: string
  display_name: string
  unit: string | null
  chart_type: string
}
