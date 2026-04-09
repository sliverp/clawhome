<template>
  <div class="layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">ClawHome</span>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/dashboard" class="nav-item active">总览</router-link>
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{{ auth.user?.username?.charAt(0).toUpperCase() }}</div>
          <div class="user-meta">
            <div class="user-name">{{ auth.user?.username }}</div>
            <div class="user-email">{{ auth.user?.email }}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" @click="logout">退出</button>
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <div class="page-header">
        <h1 class="page-title">Agent 总览</h1>
        <button class="btn btn-primary" @click="showAddModal = true">+ 添加 Agent</button>
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-card card">
          <div class="stat-label">Agent 总数</div>
          <div class="stat-value">{{ agents.agents.length }}</div>
        </div>
        <div class="stat-card card">
          <div class="stat-label">在线</div>
          <div class="stat-value online">{{ onlineCount }}</div>
        </div>
        <div class="stat-card card">
          <div class="stat-label">离线</div>
          <div class="stat-value offline">{{ offlineCount }}</div>
        </div>
      </div>

      <!-- Agent list -->
      <div v-if="loading" class="loading">加载中…</div>
      <div v-else-if="agents.agents.length === 0" class="empty-state card">
        <div class="empty-icon">🤖</div>
        <div class="empty-title">还没有 Agent</div>
        <div class="empty-desc">点击「添加 Agent」获取安装提示词，交给你的 Agent 一键安装</div>
        <button class="btn btn-primary" @click="showAddModal = true">+ 添加 Agent</button>
      </div>
      <div v-else class="agent-grid">
        <AgentCard
          v-for="agent in agents.agents"
          :key="agent.id"
          :agent="agent"
          :metrics="agents.latestMetrics[agent.id]"
          @click="$router.push(`/agents/${agent.id}`)"
        />
      </div>
    </main>

    <!-- Add Agent Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal card">
        <h3 class="modal-title">添加 Agent</h3>

        <div v-if="!installInfo">
          <div class="form-group" style="margin-bottom:16px">
            <label class="form-label">Agent 名称（可选）</label>
            <input v-model="newAgentName" type="text" class="form-input" placeholder="如：办公室 openclaw" />
          </div>
          <p v-if="addError" class="error-msg" style="margin-bottom:12px">{{ addError }}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showAddModal = false">取消</button>
            <button class="btn btn-primary" :disabled="creating" @click="createAgent">
              {{ creating ? '生成中…' : '生成安装提示词' }}
            </button>
          </div>
        </div>

        <div v-else class="install-result">
          <div class="install-step">
            <div class="install-label">将以下提示词复制给你的 Agent：</div>
            <div class="install-prompt">{{ installInfo.prompt }}</div>
            <button class="btn btn-ghost btn-sm copy-btn" @click="copyPrompt">
              {{ copied ? '已复制' : '复制提示词' }}
            </button>
          </div>
          <div class="install-note">
            Agent 会自动访问安装说明页面并完成安装，安装成功后此页面会实时更新。
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" @click="closeAddModal">完成</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useAgentsStore } from '../stores/agents.js'
import { agentsApi, type AgentInstallInfo } from '../api/index.js'
import AgentCard from '../components/AgentCard.vue'

const auth = useAuthStore()
const agents = useAgentsStore()
const router = useRouter()

const loading = ref(true)
const showAddModal = ref(false)
const newAgentName = ref('')
const creating = ref(false)
const addError = ref('')
const installInfo = ref<AgentInstallInfo | null>(null)
const copied = ref(false)

const onlineCount = computed(() => agents.agents.filter((a) => a.status === 'online').length)
const offlineCount = computed(() => agents.agents.filter((a) => a.status !== 'online').length)

onMounted(async () => {
  await auth.fetchMe()
  await agents.fetchAgents()
  loading.value = false
  agents.connectDashboardWS()
})

onUnmounted(() => {
  agents.disconnectWS()
})

async function createAgent() {
  addError.value = ''
  creating.value = true
  try {
    const res = await agentsApi.create({ name: newAgentName.value || undefined })
    installInfo.value = res.data
    // Refresh agent list
    await agents.fetchAgents()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    addError.value = err.response?.data?.detail || '创建失败'
  } finally {
    creating.value = false
  }
}

async function copyPrompt() {
  if (!installInfo.value) return
  await navigator.clipboard.writeText(installInfo.value.prompt)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function closeAddModal() {
  showAddModal.value = false
  installInfo.value = null
  newAgentName.value = ''
  copied.value = false
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout { display: flex; min-height: 100vh; }

/* Sidebar */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #13152a;
  border-right: 1px solid #2d3148;
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
}
.sidebar-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 32px; padding: 0 8px; }
.logo-icon { font-size: 20px; }
.logo-text { font-size: 18px; font-weight: 700; color: #6366f1; }
.sidebar-nav { flex: 1; }
.nav-item {
  display: block;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: #94a3b8;
  transition: background .15s, color .15s;
}
.nav-item:hover, .nav-item.active { background: #1e2235; color: #e2e8f0; }
.sidebar-footer { border-top: 1px solid #2d3148; padding-top: 16px; display: flex; flex-direction: column; gap: 12px; }
.user-info { display: flex; align-items: center; gap: 10px; }
.user-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: #6366f1; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; flex-shrink: 0;
}
.user-name { font-size: 13px; font-weight: 600; }
.user-email { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
.btn-sm { padding: 5px 10px; font-size: 12px; }

/* Main */
.main { flex: 1; padding: 32px 36px; overflow-y: auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.page-title { font-size: 24px; font-weight: 700; }

/* Stats */
.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
.stat-card { padding: 20px 24px; }
.stat-label { font-size: 13px; color: #64748b; margin-bottom: 8px; }
.stat-value { font-size: 32px; font-weight: 700; }
.stat-value.online { color: #4ade80; }
.stat-value.offline { color: #78716c; }

/* Agent grid */
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.loading, .empty-state { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.empty-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.empty-desc { color: #64748b; font-size: 14px; margin-bottom: 24px; max-width: 360px; margin-left: auto; margin-right: auto; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal { width: 100%; max-width: 520px; }
.modal-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.install-result { display: flex; flex-direction: column; gap: 16px; }
.install-label { font-size: 13px; color: #94a3b8; margin-bottom: 8px; }
.install-prompt {
  background: #0f1117;
  border: 1px solid #2d3148;
  border-radius: 8px;
  padding: 14px;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}
.copy-btn { margin-top: 8px; }
.install-note { font-size: 13px; color: #64748b; line-height: 1.6; }
</style>
