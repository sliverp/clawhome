/**
 * LobsterAPI · 龙虾界面接入层
 *
 * 职责：
 * 1. 登录态检查（读 localStorage access_token，未登录跳 /login）
 * 2. Agent 选择：URL 无 agent_id 时展示选择蒙层，不加载 app.js
 * 3. 封装 fetch 带 Bearer、错误 401 自动跳登录
 * 4. Agent 新建、切换、列表刷新
 * 5. 暴露 window.LOBSTER_CTX = { agentId, agent, token } 给 app.js 使用
 */
;(function () {
  'use strict'

  const TOKEN_KEY = 'access_token'
  const token = localStorage.getItem(TOKEN_KEY)

  // 1) 未登录 → 跳登录页
  if (!token) {
    window.location.replace('/login')
    return
  }

  // 2) 封装 fetch
  async function apiFetch(path, opts = {}) {
    const res = await fetch('/api' + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        ...(opts.headers || {}),
      },
    })
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.replace('/login')
      throw new Error('unauthorized')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body || res.statusText}`)
    }
    if (res.status === 204) return null
    return res.json()
  }

  const LobsterAPI = {
    token,
    agentId: null,
    agent: null,

    getAgents() {
      return apiFetch('/agents')
    },
    getAgent(id) {
      return apiFetch('/agents/' + id)
    },
    createAgent(name) {
      return apiFetch('/agents', {
        method: 'POST',
        body: JSON.stringify({ name: name || undefined }),
      })
    },
    deleteAgent(id) {
      return apiFetch('/agents/' + id, { method: 'DELETE' })
    },
    logout() {
      localStorage.removeItem(TOKEN_KEY)
      window.location.replace('/login')
    },
    /** 切换到某个 Agent，硬跳转带 query */
    switchAgent(agentId) {
      window.location.href = '/lobster/?agent_id=' + encodeURIComponent(agentId)
    },
    /** 返回 Agent 选择页（清除当前 agent_id） */
    backToPicker() {
      window.location.href = '/lobster/'
    },
  }

  window.LobsterAPI = LobsterAPI

  // 3) 解析 URL agent_id
  const params = new URLSearchParams(window.location.search)
  const agentIdParam = params.get('agent_id')

  // 4) 动态加载主 app 脚本的工具
  function loadAppScripts() {
    const scripts = [
      'assets/phaser.min.js',
      'phaser-scenes.js?v=3.3',
      'sprite-animator.js',
      'app.js?v=10.3',
    ]
    function loadNext(i) {
      if (i >= scripts.length) return
      const s = document.createElement('script')
      s.src = scripts[i]
      s.onload = () => loadNext(i + 1)
      s.onerror = () => console.error('Failed to load', scripts[i])
      document.body.appendChild(s)
    }
    loadNext(0)
  }

  // 5) 没有 agent_id → 显示选择蒙层，阻止加载 app.js
  if (!agentIdParam) {
    document.addEventListener('DOMContentLoaded', () => {
      renderAgentPicker()
    })
    return
  }

  // 6) 有 agent_id → 预先拉取 agent 信息验证，然后加载 app.js
  const parsedId = parseInt(agentIdParam, 10)
  if (isNaN(parsedId) || parsedId <= 0) {
    window.location.replace('/lobster/')
    return
  }

  LobsterAPI.agentId = parsedId
  document.addEventListener('DOMContentLoaded', () => {
    // 尝试拉 agent 详情；不存在或无权限时返回选择页
    LobsterAPI.getAgent(parsedId)
      .then((agent) => {
        LobsterAPI.agent = agent
        window.LOBSTER_CTX = { agentId: parsedId, agent, token }
        // 页面头部 Agent 下拉渲染
        renderAgentSwitcher(agent)
        // 继续加载原龙虾脚本
        loadAppScripts()
      })
      .catch((err) => {
        console.warn('Agent unavailable, back to picker:', err)
        window.location.replace('/lobster/')
      })
  })

  // ─────────────────────────────────────────────────────────
  // 视图：Agent 选择蒙层
  // ─────────────────────────────────────────────────────────
  function renderAgentPicker() {
    const root = document.createElement('div')
    root.id = 'lobster-boot'
    root.innerHTML = `
      <div class="boot-bg"></div>
      <div class="boot-frame">
        <div class="boot-header">
          <div class="boot-title">🦞 LightClaw 龙虾小镇</div>
          <div class="boot-subtitle">选择一个 Agent 进入它的云上家园</div>
          <button class="boot-logout" id="boot-logout" type="button">退出登录</button>
        </div>
        <div class="boot-list" id="boot-list">
          <div class="boot-loading">加载中...</div>
        </div>
        <div class="boot-actions">
          <button class="boot-new" id="boot-new" type="button">+ 新建 Agent</button>
        </div>
      </div>

      <!-- 新建 Agent 弹窗 -->
      <div class="boot-modal" id="boot-modal" style="display:none">
        <div class="boot-modal__dialog">
          <div class="boot-modal__title" id="boot-modal-title">新建 Agent</div>
          <div class="boot-modal__body" id="boot-modal-body">
            <label class="boot-field">
              <span class="boot-field__label">名字（可选，留空自动生成）</span>
              <input id="boot-new-name" class="boot-field__input" placeholder="如：办公室 openclaw" />
            </label>
          </div>
          <div class="boot-modal__footer">
            <button class="boot-btn boot-btn--ghost" id="boot-modal-cancel" type="button">取消</button>
            <button class="boot-btn boot-btn--primary" id="boot-modal-submit" type="button">生成安装提示词</button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(root)

    document.getElementById('boot-logout').addEventListener('click', () => LobsterAPI.logout())
    document.getElementById('boot-new').addEventListener('click', () => openNewAgentModal())
    document.getElementById('boot-modal-cancel').addEventListener('click', () => closeModal())
    document.getElementById('boot-modal-submit').addEventListener('click', submitNewAgent)

    refreshAgentList()
  }

  async function refreshAgentList() {
    const listEl = document.getElementById('boot-list')
    if (!listEl) return
    listEl.innerHTML = '<div class="boot-loading">加载中...</div>'
    try {
      const agents = await LobsterAPI.getAgents()
      if (!agents || agents.length === 0) {
        listEl.innerHTML = `
          <div class="boot-empty">
            <div class="boot-empty__icon">🦐</div>
            <div class="boot-empty__text">还没有 Agent，创建一个吧</div>
          </div>`
        return
      }
      listEl.innerHTML = agents.map(renderAgentCardHTML).join('')
      listEl.querySelectorAll('[data-agent-id]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = parseInt(el.getAttribute('data-agent-id'), 10)
          if (!isNaN(id)) LobsterAPI.switchAgent(id)
        })
      })
      listEl.querySelectorAll('[data-del-id]').forEach((el) => {
        el.addEventListener('click', async (ev) => {
          ev.stopPropagation()
          const id = parseInt(el.getAttribute('data-del-id'), 10)
          const name = el.getAttribute('data-del-name') || ''
          if (!confirm(`删除 Agent「${name}」？此操作不可撤销。`)) return
          await LobsterAPI.deleteAgent(id)
          refreshAgentList()
        })
      })
    } catch (err) {
      listEl.innerHTML = `<div class="boot-error">加载失败：${escapeHtml(err.message || err)}</div>`
    }
  }

  function renderAgentCardHTML(agent) {
    const statusClass = 'boot-card__status--' + (agent.status || 'offline')
    const statusText = { online: '在线', offline: '离线', error: '异常' }[agent.status] || '离线'
    const typeLabel = agent.agent_type || '未注册'
    return `
      <div class="boot-card" data-agent-id="${agent.id}">
        <div class="boot-card__avatar">🦞</div>
        <div class="boot-card__body">
          <div class="boot-card__name">${escapeHtml(agent.name)}</div>
          <div class="boot-card__meta">
            <span class="boot-card__type">${escapeHtml(typeLabel)}</span>
            <span class="boot-card__status ${statusClass}">${statusText}</span>
          </div>
        </div>
        <div class="boot-card__actions">
          <button class="boot-card__del" data-del-id="${agent.id}" data-del-name="${escapeAttr(agent.name)}" type="button" aria-label="删除">✕</button>
        </div>
      </div>`
  }

  function openNewAgentModal() {
    const modal = document.getElementById('boot-modal')
    document.getElementById('boot-modal-title').textContent = '新建 Agent'
    document.getElementById('boot-modal-body').innerHTML = `
      <label class="boot-field">
        <span class="boot-field__label">名字（可选，留空自动生成）</span>
        <input id="boot-new-name" class="boot-field__input" placeholder="如：办公室 openclaw" />
      </label>
    `
    const footer = modal.querySelector('.boot-modal__footer')
    footer.innerHTML = `
      <button class="boot-btn boot-btn--ghost" id="boot-modal-cancel" type="button">取消</button>
      <button class="boot-btn boot-btn--primary" id="boot-modal-submit" type="button">生成安装提示词</button>
    `
    footer.querySelector('#boot-modal-cancel').addEventListener('click', closeModal)
    footer.querySelector('#boot-modal-submit').addEventListener('click', submitNewAgent)
    modal.style.display = 'flex'
    setTimeout(() => document.getElementById('boot-new-name')?.focus(), 30)
  }

  async function submitNewAgent() {
    const input = document.getElementById('boot-new-name')
    const name = input ? input.value.trim() : ''
    const submitBtn = document.getElementById('boot-modal-submit')
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.textContent = '生成中...'
    }
    try {
      const info = await LobsterAPI.createAgent(name)
      showInstallPrompt(info)
    } catch (err) {
      alert('创建失败：' + (err.message || err))
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.textContent = '生成安装提示词'
      }
    }
  }

  function showInstallPrompt(info) {
    const modal = document.getElementById('boot-modal')
    document.getElementById('boot-modal-title').textContent = '安装指令已生成'
    const body = document.getElementById('boot-modal-body')
    body.innerHTML = `
      <div class="boot-install__label">将以下提示词复制给你的 Agent：</div>
      <textarea class="boot-install__prompt" id="boot-install-prompt" readonly>${escapeHtml(info.prompt)}</textarea>
      <div class="boot-install__note">
        Agent 会自动访问安装说明并完成绑定。安装完成后，这个 Agent 会出现在列表中。
      </div>
    `
    const footer = modal.querySelector('.boot-modal__footer')
    footer.innerHTML = `
      <button class="boot-btn boot-btn--primary" id="boot-copy" type="button">复制提示词</button>
      <button class="boot-btn boot-btn--ghost" id="boot-done" type="button">完成</button>
    `
    footer.querySelector('#boot-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(info.prompt)
        const btn = footer.querySelector('#boot-copy')
        btn.textContent = '✓ 已复制'
        setTimeout(() => (btn.textContent = '复制提示词'), 2000)
      } catch (err) {
        alert('复制失败，请手动选中文本复制')
      }
    })
    footer.querySelector('#boot-done').addEventListener('click', () => {
      closeModal()
      refreshAgentList()
    })
  }

  function closeModal() {
    const modal = document.getElementById('boot-modal')
    if (modal) modal.style.display = 'none'
  }

  // ─────────────────────────────────────────────────────────
  // 视图：龙虾界面内的 Agent 切换下拉
  // ─────────────────────────────────────────────────────────
  function renderAgentSwitcher(currentAgent) {
    // 等 app.js 的 DOM 就绪后挂到顶部 bar
    const mount = () => {
      const topBar = document.querySelector('.top-bar, #top-bar, .top-info')
      if (!topBar && document.body) {
        // 没有 topBar 就直接挂 body 右上
        const sw = buildSwitcher(currentAgent)
        sw.classList.add('lobster-switcher--float')
        document.body.appendChild(sw)
      } else if (topBar) {
        topBar.appendChild(buildSwitcher(currentAgent))
      }
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(mount, 100)
    } else {
      document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 100))
    }
  }

  function buildSwitcher(currentAgent) {
    const wrap = document.createElement('div')
    wrap.className = 'lobster-switcher'
    wrap.innerHTML = `
      <button class="lobster-switcher__btn" id="ls-btn" type="button">
        <span class="lobster-switcher__icon">🦞</span>
        <span class="lobster-switcher__name">${escapeHtml(currentAgent.name)}</span>
        <span class="lobster-switcher__caret">▾</span>
      </button>
      <div class="lobster-switcher__menu" id="ls-menu" style="display:none">
        <div class="lobster-switcher__list" id="ls-list"><div class="boot-loading">加载中...</div></div>
        <div class="lobster-switcher__footer">
          <button class="lobster-switcher__action" id="ls-back" type="button">返回列表</button>
          <button class="lobster-switcher__action" id="ls-logout" type="button">退出登录</button>
        </div>
      </div>
    `
    const btn = wrap.querySelector('#ls-btn')
    const menu = wrap.querySelector('#ls-menu')
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const visible = menu.style.display !== 'none'
      menu.style.display = visible ? 'none' : 'block'
      if (!visible) loadSwitcherAgents()
    })
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) menu.style.display = 'none'
    })
    wrap.querySelector('#ls-back').addEventListener('click', () => LobsterAPI.backToPicker())
    wrap.querySelector('#ls-logout').addEventListener('click', () => LobsterAPI.logout())
    return wrap
  }

  async function loadSwitcherAgents() {
    const list = document.getElementById('ls-list')
    if (!list) return
    try {
      const agents = await LobsterAPI.getAgents()
      list.innerHTML = agents
        .map((a) => {
          const active = a.id === LobsterAPI.agentId ? ' ls-item--active' : ''
          const statusDot = `<span class="ls-item__dot ls-item__dot--${a.status || 'offline'}"></span>`
          return `
            <div class="ls-item${active}" data-id="${a.id}">
              ${statusDot}
              <span class="ls-item__name">${escapeHtml(a.name)}</span>
            </div>`
        })
        .join('')
      list.querySelectorAll('.ls-item').forEach((el) => {
        el.addEventListener('click', () => {
          const id = parseInt(el.getAttribute('data-id'), 10)
          if (id === LobsterAPI.agentId) return
          LobsterAPI.switchAgent(id)
        })
      })
    } catch (err) {
      list.innerHTML = `<div class="boot-error">加载失败</div>`
    }
  }

  // ─────────────────────────────────────────────────────────
  // 辅助
  // ─────────────────────────────────────────────────────────
  function escapeHtml(s) {
    if (s == null) return ''
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
  function escapeAttr(s) {
    return escapeHtml(s)
  }
})()
