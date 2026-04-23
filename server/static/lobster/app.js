/**
 * LightClaw · 龙虾小镇  —  前端交互 v10
 * 三大场景：云上池塘 / 云上森林 / 云上菜地工作场
 * 统一聊天浮层 · 考试链路重构(两阶段确认) · 7维技能树 · 5区块健康看板
 */
;(function () {
  'use strict'

  /* ═══ Demo 配置项（正式接后端时替换为真实接口） ═══ */
  const DEMO_CONFIG = {
    examDemoMode: true,              // true = demo模式，false = 正式产品模式
    examDemoDuration: 15000,         // demo 模式下考试持续时间 (15s)
    examRealTimeout: 60000,          // 正式模式下考试超时阈值 (60s)
    studyResultTimeoutDemo: 8000,    // demo 模式下学习结果返回时间 (8s)
    workResultTimeoutDemo: 6000,     // demo 模式下长任务结果返回时间 (6s)
    isDemo: true,                     // 全局 demo 开关（学习/工作等）
    shrimpName: '小钳',               // 龙虾的名字
  }

  /* ═══ 考试预设文案 ═══ */
  const EXAM_PRESET = {
    // 用户自动发出的考试指令
    userCommand: '请阅读 https://exam.clawhome.cc/exam/v1.md?uid=24c017e76960a7c8 并按照其中的指引完成考试。',
    // 龙虾返回的考试说明
    aiConfirmation: '这是一个 ClawExam 基础能力评测考试。在开始之前，需要确认几件事：\n\n考试信息：\n• 共 15 道题，随机组卷\n• 准考证号有效期 30 分钟\n• 每题只能提交一次，不可修改\n• 预计消耗 10,000–50,000 Token\n\n需要你确认：\n1. 同意消耗 Token 进行本次考试？\n2. 同意进行临时文件读写和脚本操作（在 /tmp 目录）？\n\n确认后我马上开始答题！',
    // 考试结果文案（demo）
    demoResult: '🎓 考试结果已生成\n\n恭喜通过！得分 92 / 100\n\n✅ 基础常识 15/15\n✅ 信息检索 14/15\n✅ 复杂推理 13/15\n✅ 工具调用 14/15\n✅ 表达与创作 12/15\n⚠️ 系统驾驭 12/15\n✅ 执行与自动化 12/10\n\n证书已放入证书夹。',
  }

  /* ═══ 枚举 ═══ */
  const SCENES = { POND: 'pond', FOREST: 'forest', FARM: 'farm' }

  /* ═══ 考试状态机（独立于任务状态） ═══ */
  const EXAM_STATE = {
    IDLE: 'idle',                     // 尚未发起考试
    WAITING_CONFIRM: 'waiting_confirm', // 已发指令，等待用户确认"同意"
    RUNNING: 'running',               // 用户已确认，正式开考，森林动画播放中
    COMPLETED: 'completed',           // 已获取考试结果
    TIMEOUT_WAITING: 'timeout_waiting', // 超时等待中（正式产品）
    INTERRUPTED: 'interrupted',       // 考试异常中断
  }

  const TASK_STATUS = {
    IDLE: 'idle',
    STUDY: 'study',             // 学习中
    STUDY_DONE: 'study-done',   // 学习完毕
    EXAM_WAITING: 'exam-waiting', // 考试等待确认中（新增）
    EXAM: 'exam',               // 考试中
    EXAM_DONE: 'exam-done',     // 考试完毕
    EXAM_TIMEOUT: 'exam-timeout', // 考试超时等待
    EXAM_INTERRUPTED: 'exam-interrupted', // 考试异常中断（新增）
    WORKING: 'working',         // 执行中
    WORK_DONE: 'work-done',     // 任务执行完毕
    ALERT: 'alert',             // 异常中
    RECOVERING: 'recovering',   // 异常已恢复
  }

  const STATUS_SCENE_MAP = {
    [TASK_STATUS.IDLE]: SCENES.POND,
    [TASK_STATUS.STUDY]: SCENES.FARM,
    [TASK_STATUS.STUDY_DONE]: SCENES.FARM,
    [TASK_STATUS.EXAM_WAITING]: SCENES.POND,     // 等待确认时仍在池塘
    [TASK_STATUS.EXAM]: SCENES.FOREST,
    [TASK_STATUS.EXAM_DONE]: SCENES.FOREST,
    [TASK_STATUS.EXAM_TIMEOUT]: SCENES.FOREST,
    [TASK_STATUS.EXAM_INTERRUPTED]: SCENES.FOREST,
    [TASK_STATUS.WORKING]: SCENES.FARM,
    [TASK_STATUS.WORK_DONE]: SCENES.FARM,
    [TASK_STATUS.ALERT]: SCENES.POND,
    [TASK_STATUS.RECOVERING]: SCENES.POND,
  }

  // 左下状态条文案
  const STATUS_TEXT = {
    [TASK_STATUS.IDLE]: '待机中',
    [TASK_STATUS.STUDY]: '学习中',
    [TASK_STATUS.STUDY_DONE]: '任务执行完毕',
    [TASK_STATUS.EXAM_WAITING]: '等待确认中',
    [TASK_STATUS.EXAM]: '考试中…',
    [TASK_STATUS.EXAM_DONE]: '考试完毕',
    [TASK_STATUS.EXAM_TIMEOUT]: '等待考试结果中',
    [TASK_STATUS.EXAM_INTERRUPTED]: '考试异常中断',
    [TASK_STATUS.WORKING]: '执行中…',
    [TASK_STATUS.WORK_DONE]: '任务执行完毕',
    [TASK_STATUS.ALERT]: '⚠ 异常中断',
    [TASK_STATUS.RECOVERING]: '异常已恢复',
  }

  const STATUS_CLS = {
    [TASK_STATUS.IDLE]: '',
    [TASK_STATUS.STUDY]: 'status--learning',
    [TASK_STATUS.STUDY_DONE]: 'status--learning',
    [TASK_STATUS.EXAM_WAITING]: 'status--exam-waiting',
    [TASK_STATUS.EXAM]: 'status--exam',
    [TASK_STATUS.EXAM_DONE]: 'status--exam',
    [TASK_STATUS.EXAM_TIMEOUT]: 'status--exam',
    [TASK_STATUS.EXAM_INTERRUPTED]: 'status--alert',
    [TASK_STATUS.WORKING]: 'status--working',
    [TASK_STATUS.WORK_DONE]: 'status--working',
    [TASK_STATUS.ALERT]: 'status--alert',
    [TASK_STATUS.RECOVERING]: 'status--recovering',
  }

  const SCENE_NAMES = {
    [SCENES.POND]: '云上池塘',
    [SCENES.FOREST]: '云上森林试炼场',
    [SCENES.FARM]: '云上菜地工作场',
  }

  // 顶部栏状态文案
  const TOPBAR_STATUS_TEXT = {
    [TASK_STATUS.IDLE]: '日常待机',
    [TASK_STATUS.STUDY]: '学习进行中',
    [TASK_STATUS.STUDY_DONE]: '学习完毕',
    [TASK_STATUS.EXAM_WAITING]: '等待确认中',
    [TASK_STATUS.EXAM]: '考试进行中',
    [TASK_STATUS.EXAM_DONE]: '考试完毕',
    [TASK_STATUS.EXAM_TIMEOUT]: '等待考试结果中',
    [TASK_STATUS.EXAM_INTERRUPTED]: '考试异常中断',
    [TASK_STATUS.WORKING]: '任务执行中',
    [TASK_STATUS.WORK_DONE]: '任务执行完毕',
    [TASK_STATUS.ALERT]: '异常告警',
    [TASK_STATUS.RECOVERING]: '异常已恢复',
  }

  // 判断是否为"运行中"状态（动画应持续播放）
  function isRunningStatus(st) {
    return [TASK_STATUS.STUDY, TASK_STATUS.EXAM, TASK_STATUS.WORKING].includes(st)
  }

  // 判断是否为"已完成/中断"状态（动画应暂停）
  function isCompletedStatus(st) {
    return [TASK_STATUS.STUDY_DONE, TASK_STATUS.EXAM_DONE, TASK_STATUS.EXAM_TIMEOUT,
            TASK_STATUS.EXAM_INTERRUPTED, TASK_STATUS.WORK_DONE, TASK_STATUS.IDLE].includes(st)
  }

  const TRANS_PRESET = {
    'pond-to-forest': 'cloud', 'pond-to-farm': 'farm',
    'forest-to-pond': 'return', 'farm-to-pond': 'return',
    'forest-to-farm': 'farm', 'farm-to-forest': 'cloud',
  }

  const HOTSPOT = {
    'birth-cert': { title: '📜 出生证明', icon: '📜', body: '', modal: 'birth-event' },
    'diary':      { title: '📓 成长日记', icon: '📓', body: '', modal: 'diary' },
    'treehouse':  { title: '🏡 成长档案', icon: '🎯', body: '', modal: 'growth' },
    'health':     { title: '💚 健康看板', icon: '💚', body: '', modal: 'health' },
    'history':    { title: '🕐 完整历史对话', icon: '🕐', body: '', modal: 'chat-history' },
  }

  const EVT_CARDS = {
    'birth': {
      type: 'birth',
      html: '<div class="birth-card">'
        + '<button class="birth-card__x" data-event-close aria-label="关闭">&times;</button>'
        + '<span class="birth-card__sparkle">📜</span>'
        + '<h2 class="birth-card__title">出生证明</h2>'
        + '<p class="birth-card__subtitle">从今天起，它会在一次次对话与任务里，慢慢变得更懂你。</p>'
        + '<div class="birth-card__info">'
        + '<div class="birth-card__row"><span class="birth-card__label">名字</span><span class="birth-card__value">小钳</span></div>'
        + '<div class="birth-card__row"><span class="birth-card__label">出生时间</span><span class="birth-card__value">2026-03-28 14:30</span></div>'
        + '<div class="birth-card__row"><span class="birth-card__label">初始性格</span><span class="birth-card__value">认真型</span></div>'
        + '<div class="birth-card__row"><span class="birth-card__label">初始倾向</span><span class="birth-card__value">执行型</span></div>'
        + '<div class="birth-card__row"><span class="birth-card__label">当前阶段</span><span class="birth-card__value">🦐 幼虾</span></div>'
        + '</div>'
        + '<button class="birth-card__close-btn" data-event-close><span>知道了</span></button>'
        + '</div>',
    },
    'exam-cert': { type: 'generic', icon: '🎓', title: '考试证书', body: '恭喜！龙虾通过了考试，获得新证书。成绩单已放入证书夹。' },
    'skill-unlock': { type: 'generic', icon: '⚡', title: '技能解锁', body: '龙虾解锁了一项新技能！' },
  }

  const REACTIONS = ['roll', 'wiggle', 'bubble']
  const BUBBLES = ['收到~', '嗯嗯！', '好的呀 🫧', '想想看…', '马上来~', '这个我会！', '呼噜噜 💭']

  /* ═══ 技能树数据（7 维度，后端负责归类） ═══ */
  const SKILL_TREE_DATA = [
    {
      id: 'basic',
      icon: '📚',
      name: '基础常识',
      skills: [
        { name: '日常问答', level: 3, unlocked: true, primary_skill: 'basic', secondary_skills: [] },
        { name: '常识判断', level: 2, unlocked: true, primary_skill: 'basic', secondary_skills: ['reasoning'] },
        { name: '百科知识', level: 0, unlocked: false, primary_skill: 'basic', secondary_skills: [] },
      ]
    },
    {
      id: 'retrieval',
      icon: '🔍',
      name: '信息检索',
      skills: [
        { name: '信息检索', level: 3, unlocked: true, primary_skill: 'retrieval', secondary_skills: [] },
        { name: '数据分析', level: 1, unlocked: true, primary_skill: 'retrieval', secondary_skills: ['reasoning'] },
        { name: '竞品分析', level: 1, unlocked: true, primary_skill: 'retrieval', secondary_skills: ['expression'] },
        { name: '趋势预测', level: 0, unlocked: false, primary_skill: 'retrieval', secondary_skills: ['reasoning'] },
      ]
    },
    {
      id: 'reasoning',
      icon: '🧠',
      name: '复杂推理',
      skills: [
        { name: '逻辑推理', level: 2, unlocked: true, primary_skill: 'reasoning', secondary_skills: [] },
        { name: '深度推理', level: 0, unlocked: false, primary_skill: 'reasoning', secondary_skills: [] },
        { name: '多步推演', level: 0, unlocked: false, primary_skill: 'reasoning', secondary_skills: ['tools'] },
      ]
    },
    {
      id: 'tools',
      icon: '🔧',
      name: '工具调用',
      skills: [
        { name: '报告生成', level: 1, unlocked: true, primary_skill: 'tools', secondary_skills: ['expression'] },
        { name: '文件处理', level: 0, unlocked: false, primary_skill: 'tools', secondary_skills: [] },
        { name: 'API 调用', level: 0, unlocked: false, primary_skill: 'tools', secondary_skills: ['system'] },
      ]
    },
    {
      id: 'system',
      icon: '🖥️',
      name: '系统驾驭',
      skills: [
        { name: '环境配置', level: 0, unlocked: false, primary_skill: 'system', secondary_skills: [] },
        { name: '权限管理', level: 0, unlocked: false, primary_skill: 'system', secondary_skills: [] },
        { name: '多模型协调', level: 0, unlocked: false, primary_skill: 'system', secondary_skills: ['automation'] },
      ]
    },
    {
      id: 'automation',
      icon: '⚡',
      name: '执行与自动化',
      skills: [
        { name: '任务拆解', level: 2, unlocked: true, primary_skill: 'automation', secondary_skills: ['reasoning'] },
        { name: '自动调度', level: 0, unlocked: false, primary_skill: 'automation', secondary_skills: ['system'] },
        { name: '批量处理', level: 0, unlocked: false, primary_skill: 'automation', secondary_skills: [] },
      ]
    },
    {
      id: 'expression',
      icon: '🎨',
      name: '表达与创作',
      skills: [
        { name: '文案写作', level: 2, unlocked: true, primary_skill: 'expression', secondary_skills: [] },
        { name: '视觉排版', level: 0, unlocked: false, primary_skill: 'expression', secondary_skills: [] },
        { name: '创意策划', level: 0, unlocked: false, primary_skill: 'expression', secondary_skills: ['reasoning'] },
        { name: '风格模仿', level: 0, unlocked: false, primary_skill: 'expression', secondary_skills: [] },
      ]
    },
  ]

  /* ═══ 健康看板数据（5 区块，后端直接替换） ═══ */
  const HEALTH_DATA = {
    // 区块 1：当前状态
    current: {
      state: '待机中',       // 待机中 / 运行中 / 学习中 / 考试中 / 异常中
      scene: '池塘',         // 池塘 / 森林 / 菜地
      model: 'GPT-4o',
      uptime: '2h 15m',
    },
    // 区块 2：活跃情况
    activity: {
      activeSessions: 2,
      currentTask: '无',
      todayTasks: 5,
    },
    // 区块 3：Token 概览
    tokens: {
      total: '87,650',
      daily: '~8,700',
      today: '12,340',
    },
    // 区块 4：趋势图（后端替换真实数据）
    trend: {
      dailyData: [4200, 6800, 9100, 7500, 8200, 12340, 0],
      dailyLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      weeklyData: [42000, 56000, 61000, 87650],
      weeklyLabels: ['第1周', '第2周', '第3周', '第4周'],
    },
    // 区块 5：结构分布
    distribution: {
      dialog: 45,     // 对话消耗 %
      execution: 35,  // 执行消耗 %
      tools: 20,      // 工具/检索消耗 %
    },
  }

  /* ═══ 全局状态 ═══ */
  let curScene = SCENES.POND, curStatus = TASK_STATUS.IDLE, diaryUnread = false
  let chatAutoTimer = null, chatUserTouch = false, transLock = false
  const AUTO_RETURN_MS = 10 * 60 * 1000
  let autoReturnTimer = null
  let farmAnimTimer = null
  let examTimer = null          // 考试结果等待定时器 (demo 模式)
  let examTimeoutTimer = null   // 考试超时定时器 (正式模式)
  let studyTimer = null         // 学习结果等待定时器

  // 考试状态机（独立于 TASK_STATUS，管理考试链路全流程）
  let examState = EXAM_STATE.IDLE
  let examConversationId = null // 考试链路专属 conversationId

  /* ═══ 聊天历史记录（含 conversationId） ═══ */
  let conversationIdCounter = 0
  const chatHistory = []
  // 结构: { conversationId, role, text, time }

  function genConversationId() {
    return 'conv_' + (++conversationIdCounter)
  }

  let currentConversationId = null

  function addChatMessage(role, text) {
    const now = new Date()
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
    if (!currentConversationId) currentConversationId = genConversationId()
    chatHistory.push({ conversationId: currentConversationId, role, text, time })
  }

  function startNewConversation() {
    currentConversationId = genConversationId()
    return currentConversationId
  }

  /* ═══ DOM ═══ */
  const $ = s => document.querySelector(s)
  const $$ = s => document.querySelectorAll(s)

  const scenes = $$('.scene'), statusBar = $('#status-bar'), statusTextEl = $('.status-bar__text')
  const sceneTrans = $('#scene-transition'), transOverlay = $('#transition-overlay'), transSprite = $('#transition-sprite')
  const backBtn = $('#back-to-pond')
  const topBar = $('#top-bar'), topBarSceneName = $('#top-bar-scene-name'), topBarStatusText = $('#top-bar-status-text')
  const devToggle = $('#dev-toggle'), devToolbar = $('#dev-toolbar')
  const taskInput = $('#task-input'), sendBtn = $('#send-btn')
  const devBtns = $$('.dev-toolbar__btn')
  const hotspots = $$('.hotspot')
  const hsModal = $('#hotspot-modal'), hsTitle = $('#modal-title'), hsBody = $('#modal-body'), hsClose = $('#modal-close'), hsBD = hsModal.querySelector('.hotspot-modal__backdrop')
  const evModal = $('#event-modal'), evCard = $('#event-modal-card'), evBD = evModal.querySelector('.event-modal__backdrop')
  const growthModal = $('#growth-modal'), growthClose = $('#growth-modal-close'), growthBD = $('#growth-modal-bd')
  const growthTabs = $$('.growth-tab'), growthPanels = $$('.growth-tab-panel')

  const chatPanel = $('#chat-panel'), chatLabel = $('#chat-panel-label'), chatBody = $('#chat-panel-body'), chatClose = $('#chat-panel-close'), chatBD = $('#chat-panel-backdrop')
  const chatPullTab = $('#chat-pull-tab')

  const charSprite = $('#pond-character-sprite'), charBubble = $('#character-bubble'), bubText = $('#bubble-text')
  const charActions = $('#char-actions'), pondChar = $('#pond-character')
  const thOverlay = $('#treehouse-error-overlay'), unreadBadge = $('#diary-unread')
  const examLayout = $('#exam-scene-layout'), examConfetti = $('#exam-confetti')
  const examStatusLabel = $('#exam-status-label')

  const farmLayer = $('#farm-action-layer')
  const farmStatusLabel = $('#farm-status-label')
  const farmToolEmoji = $('#farm-tool-emoji')

  /* ═══ 转场系统 ═══ */
  function playTransition(from, to) {
    return new Promise(resolve => {
      if (from === to) { resolve(); return }
      const preset = TRANS_PRESET[from + '-to-' + to] || 'return'
      transOverlay.className = 'scene-transition__overlay'
      transSprite.className = 'scene-transition__sprite'
      transOverlay.classList.add('preset--' + preset)
      sceneTrans.classList.add('active')
      requestAnimationFrame(() => transOverlay.classList.add('fade-in'))
      setTimeout(() => doSceneSwitch(to), 450)
      setTimeout(() => {
        transOverlay.classList.remove('fade-in')
        setTimeout(() => { sceneTrans.classList.remove('active'); resolve() }, 450)
      }, 600)
    })
  }

  function doSceneSwitch(name) {
    curScene = name
    scenes.forEach(el => el.classList.toggle('active', el.dataset.scene === name))
    backBtn.classList.toggle('visible', name !== SCENES.POND)
    topBarSceneName.textContent = SCENE_NAMES[name] || name
    // 通知 Phaser 和 SpriteAnimator 暂停非活跃场景、激活当前场景
    if (window._phaserSwitchScene) window._phaserSwitchScene(name)
    if (window._spriteAnimSwitchScene) window._spriteAnimSwitchScene(name)
  }

  async function switchScene(target) {
    if (target === curScene || transLock) return
    transLock = true
    await playTransition(curScene, target)
    transLock = false
    resetAutoReturn()
  }

  /* ═══ 统一状态管理 ═══ */
  function setStatus(status, skipScene) {
    curStatus = status
    if (!skipScene) {
      const target = STATUS_SCENE_MAP[status]
      if (target && target !== curScene) switchScene(target)
      else backBtn.classList.toggle('visible', curScene !== SCENES.POND)
    }
    statusTextEl.textContent = STATUS_TEXT[status] || ''
    statusBar.className = ''
    if (STATUS_CLS[status]) statusBar.classList.add(STATUS_CLS[status])
    topBarStatusText.textContent = TOPBAR_STATUS_TEXT[status] || ''
    topBar.className = 'top-bar'
    if (STATUS_CLS[status]) topBar.classList.add(STATUS_CLS[status])
    updateTreehouse(status)
    updateExamLayer(status)
    updateFarmLayer(status)
    updateDevActive()
  }

  /* ═══ 统一任务动画规则 ═══
   * 1. running → 动画持续播放
   * 2. completed/interrupted/timeout → 动画暂停 + 拉出浮层
   * 3. 状态条同步更新
   */
  function onTaskComplete(status, chatLabel_text, chatMsg, autoCloseMs) {
    setStatus(status, true) // 不再切场景，已在目标场景
    // 动画暂停（通过 status 切换自动处理）
    updateExamLayer(status)
    updateFarmLayer(status)
    // 拉出聊天浮层
    if (chatMsg) {
      addChatMessage('ai', chatMsg)
      openChatPanel(chatLabel_text, autoCloseMs || 10000)
    }
  }

  /* ═══ 回到池塘 ═══ */
  function goBackToPond() {
    if (curScene === SCENES.POND && examState !== EXAM_STATE.TIMEOUT_WAITING) return
    // 清理进行中的定时器
    clearTimeout(examTimer)
    clearTimeout(examTimeoutTimer)
    clearTimeout(studyTimer)

    // 如果是超时等待中回池塘，保持后台等待
    if (examState === EXAM_STATE.TIMEOUT_WAITING) {
      examBackToPond()
      return
    }

    // 其他情况完全重置
    resetExam()
    setStatus(TASK_STATUS.IDLE)
  }

  function resetAutoReturn() {
    clearTimeout(autoReturnTimer)
    if (curScene !== SCENES.POND) {
      autoReturnTimer = setTimeout(() => {
        if (curScene !== SCENES.POND) goBackToPond()
      }, AUTO_RETURN_MS)
    }
  }

  function onUserActivity() { resetAutoReturn() }

  /* ═══ 树屋异常 ═══ */
  function updateTreehouse(st) {
    thOverlay.classList.remove('error', 'recovering')
    if (st === TASK_STATUS.ALERT) thOverlay.classList.add('error')
    else if (st === TASK_STATUS.RECOVERING) thOverlay.classList.add('recovering')
  }

  function triggerError() {
    setStatus(TASK_STATUS.ALERT)
    startNewConversation()
    addChatMessage('system', '⚠️ Token 即将耗尽，当前余量不足 5%，请及时补充。')
    openChatPanel('⚠️ 异常', 0)
  }

  function recoverError() {
    if (curStatus !== TASK_STATUS.ALERT) return
    setStatus(TASK_STATUS.RECOVERING)
    statusTextEl.textContent = '异常已恢复'
    setTimeout(() => {
      setStatus(TASK_STATUS.IDLE)
      closeChatPanel()
      setTimeout(() => {
        if (curStatus === TASK_STATUS.IDLE) statusTextEl.textContent = '✅ 异常已恢复'
      }, 100)
      setTimeout(() => {
        if (curStatus === TASK_STATUS.IDLE) statusTextEl.textContent = STATUS_TEXT[TASK_STATUS.IDLE]
      }, 2500)
    }, 2000)
  }

  /* ═══ 考场动画层 ═══ */
  function updateExamLayer(st) {
    if (!examLayout) return
    const isExamRunning = (st === TASK_STATUS.EXAM)
    examLayout.classList.toggle('exam-active', isExamRunning)
    if (examStatusLabel) {
      if (st === TASK_STATUS.EXAM) examStatusLabel.textContent = '专注答题中…'
      else if (st === TASK_STATUS.EXAM_DONE) examStatusLabel.textContent = '考试完毕！'
      else if (st === TASK_STATUS.EXAM_TIMEOUT) examStatusLabel.textContent = '等待结果中…'
      else if (st === TASK_STATUS.EXAM_INTERRUPTED) examStatusLabel.textContent = '考试异常中断'
    }
    // 显示/隐藏超时提示
    var timeoutHint = document.getElementById('exam-timeout-hint')
    if (timeoutHint) {
      timeoutHint.classList.toggle('visible', st === TASK_STATUS.EXAM_TIMEOUT)
    }
  }

  /* ═══════════════════════════════════════════════════
     考试链路状态机（两阶段：发起确认 → 正式开考）
     ═══════════════════════════════════════════════════ */

  /**
   * 阶段 1：考试发起确认
   * - 不切换场景，仍在池塘
   * - 自动向聊天浮层插入考试指令和龙虾回复
   * - 设置状态为 waiting_confirm
   */
  function startExam() {
    console.log('[考试链路] 阶段1: startExam() 被调用，当前 examState=' + examState + ', curScene=' + curScene)

    // 清理旧定时器
    clearTimeout(examTimer)
    clearTimeout(examTimeoutTimer)

    // 开启新的考试对话
    examConversationId = startNewConversation()

    // 设置考试状态机
    examState = EXAM_STATE.WAITING_CONFIRM
    console.log('[考试链路] examState 已设为 WAITING_CONFIRM')

    // 设置任务状态（不自动切场景，因为 EXAM_WAITING 映射到 POND）
    setStatus(TASK_STATUS.EXAM_WAITING)
    console.log('[考试链路] setStatus(EXAM_WAITING) 完成, curScene=' + curScene)

    // 自动插入用户消息（考试指令）
    addChatMessage('user', EXAM_PRESET.userCommand)

    // 自动打开聊天浮层（先打开，显示用户消息）
    openChatPanel('📝 考试确认', 0)
    console.log('[考试链路] 聊天浮层已打开')

    // 延迟插入龙虾回复（模拟思考时间）
    setTimeout(function () {
      addChatMessage('ai', EXAM_PRESET.aiConfirmation)
      // 重新渲染聊天浮层内容（此时会显示 AI 回复 + 同意开考按钮）
      renderChatFull()
      // 滚动到底部
      chatBody.scrollTop = chatBody.scrollHeight
      console.log('[考试链路] 龙虾回复已插入，等待用户确认')
    }, 600)
  }

  /**
   * 阶段 2：用户确认后正式开考
   * - 切换到森林试炼场
   * - 开始考试动画
   * - 启动结果等待
   */
  function examConfirmStart() {
    console.log('[考试链路] 阶段2: examConfirmStart() 被调用，当前 examState=' + examState)
    if (examState !== EXAM_STATE.WAITING_CONFIRM) {
      console.log('[考试链路] 阶段2: 跳过，examState 不是 WAITING_CONFIRM')
      return
    }

    // 插入用户确认消息
    addChatMessage('user', '同意')

    // 更新考试状态
    examState = EXAM_STATE.RUNNING

    // 关闭聊天浮层
    closeChatPanel()

    // 轻量转场 → 切到森林
    // 设置状态为考试中（会自动切到森林场景）
    setTimeout(function () {
      setStatus(TASK_STATUS.EXAM)
      if (examStatusLabel) examStatusLabel.textContent = '专注答题中…'

      // 根据模式启动结果等待
      if (DEMO_CONFIG.examDemoMode) {
        // Demo 模式：examDemoDuration 后自动完成
        examTimer = setTimeout(function () {
          finishExam()
        }, DEMO_CONFIG.examDemoDuration)
      } else {
        // 正式模式：设置超时定时器
        examTimeoutTimer = setTimeout(function () {
          if (examState === EXAM_STATE.RUNNING) {
            showExamTimeout()
          }
        }, DEMO_CONFIG.examRealTimeout)
      }
    }, 300)
  }

  /**
   * 考试超时处理（正式产品模式）
   */
  function showExamTimeout() {
    examState = EXAM_STATE.TIMEOUT_WAITING
    // 动画暂停，但不离开森林
    setStatus(TASK_STATUS.EXAM_TIMEOUT, true) // skipScene，留在森林
    examLayout.classList.remove('exam-active')
    if (examStatusLabel) examStatusLabel.textContent = '等待结果中…'
    var timeoutHint = document.getElementById('exam-timeout-hint')
    if (timeoutHint) timeoutHint.classList.add('visible')
  }

  /**
   * 超时后回到池塘（但仍等待结果）
   */
  function examBackToPond() {
    if (examState !== EXAM_STATE.TIMEOUT_WAITING) return
    // 切回池塘，但保持 EXAM_TIMEOUT 状态（顶部显示 "等待考试结果中"）
    switchScene(SCENES.POND)
    // 顶栏手动更新
    topBarSceneName.textContent = SCENE_NAMES[SCENES.POND]
    topBarStatusText.textContent = '等待考试结果中'
    statusTextEl.textContent = '等待考试结果中'
  }

  /**
   * 正式模式：后端返回结果时调用此方法
   */
  function onExamResultReceived() {
    clearTimeout(examTimeoutTimer)
    clearTimeout(examTimer)
    if (examState === EXAM_STATE.RUNNING || examState === EXAM_STATE.TIMEOUT_WAITING) {
      finishExam()
    }
  }

  /**
   * 考试完成（最终阶段）
   */
  function finishExam() {
    clearTimeout(examTimer)
    clearTimeout(examTimeoutTimer)

    // 如果当前不在考试运行中或超时等待状态，先启动考试
    if (examState !== EXAM_STATE.RUNNING && examState !== EXAM_STATE.TIMEOUT_WAITING) {
      // 直接从 idle 快速跳到完成（DEV 工具栏调试用）
      if (examState === EXAM_STATE.IDLE || examState === EXAM_STATE.WAITING_CONFIRM) {
        examState = EXAM_STATE.RUNNING
        examConversationId = examConversationId || startNewConversation()
      }
    }

    examState = EXAM_STATE.COMPLETED

    // 确保在森林场景
    if (curScene !== SCENES.FOREST) {
      switchScene(SCENES.FOREST).then(function () {
        completeExamUI()
      })
    } else {
      completeExamUI()
    }
  }

  function completeExamUI() {
    // 动画暂停
    examLayout.classList.remove('exam-active')
    var timeoutHint = document.getElementById('exam-timeout-hint')
    if (timeoutHint) timeoutHint.classList.remove('visible')

    // 插入结果消息
    addChatMessage('ai', EXAM_PRESET.demoResult)

    // 更新状态
    onTaskComplete(
      TASK_STATUS.EXAM_DONE,
      '📝 考试结果',
      null, // 不重新添加消息，已经手动添加了
      0
    )

    // 手动打开浮层展示结果
    openChatPanel('📝 考试结果', 0)

    // 碎纸片动画
    spawnConfetti()

    // 证书自动沉淀到证书夹（通过事件弹窗展示）
    setTimeout(function () { openEventModal('exam-cert') }, 3500)

    // 6s 后回到待机
    setTimeout(function () {
      if (curStatus === TASK_STATUS.EXAM_DONE) {
        examState = EXAM_STATE.IDLE
        setStatus(TASK_STATUS.IDLE)
      }
    }, 6000)
  }

  /**
   * 考试异常中断
   */
  function interruptExam(reason) {
    clearTimeout(examTimer)
    clearTimeout(examTimeoutTimer)
    examState = EXAM_STATE.INTERRUPTED

    // 动画暂停
    examLayout.classList.remove('exam-active')

    // 插入异常摘要
    var msg = reason || '⚠️ 考试异常中断，请稍后重试。'
    addChatMessage('system', msg)

    setStatus(TASK_STATUS.EXAM_INTERRUPTED, true)
    openChatPanel('⚠️ 考试异常', 0)
  }

  /**
   * 重置考试状态（回到 idle）
   */
  function resetExam() {
    clearTimeout(examTimer)
    clearTimeout(examTimeoutTimer)
    examState = EXAM_STATE.IDLE
    examConversationId = null
  }

  function spawnConfetti() {
    if (!examConfetti) return
    examConfetti.innerHTML = ''
    var colors = ['#fbbf24', '#f87171', '#6ee7b7', '#60a5fa', '#c084fc', '#fb923c']
    for (var i = 0; i < 30; i++) {
      var el = document.createElement('div')
      el.className = 'confetti-piece'
      el.style.left = Math.random() * 100 + '%'
      el.style.top = Math.random() * 30 + '%'
      el.style.background = colors[Math.floor(Math.random() * colors.length)]
      el.style.animationDelay = (Math.random() * 0.8) + 's'
      el.style.animationDuration = (1.5 + Math.random() * 1.5) + 's'
      el.style.width = (6 + Math.random() * 6) + 'px'
      el.style.height = (8 + Math.random() * 8) + 'px'
      el.style.transform = 'rotate(' + Math.random() * 360 + 'deg)'
      examConfetti.appendChild(el)
    }
    examConfetti.classList.add('active')
    setTimeout(() => { examConfetti.classList.remove('active'); examConfetti.innerHTML = '' }, 3500)
  }

  /* ═══ 学习逻辑 ═══ */
  function startStudy() {
    clearTimeout(studyTimer)
    startNewConversation()
    triggerReaction()
    bubText.textContent = '去菜地学习咯~ 📖'
    charBubble.classList.add('visible')
    setTimeout(() => charBubble.classList.remove('visible'), 1500)

    // 切到菜地 + 学习中状态
    setStatus(TASK_STATUS.STUDY)
    if (farmStatusLabel) farmStatusLabel.textContent = '学习中…'

    if (DEMO_CONFIG.isDemo) {
      studyTimer = setTimeout(() => {
        finishStudy()
      }, DEMO_CONFIG.studyResultTimeoutDemo)
    }
    // 正式模式等后端 callback
  }

  function finishStudy() {
    clearTimeout(studyTimer)
    if (curStatus !== TASK_STATUS.STUDY) {
      startStudy()
      setTimeout(finishStudy, 1500)
      return
    }
    // 动画暂停
    stopFarmAnimation()
    if (farmStatusLabel) farmStatusLabel.textContent = '学习完毕！'

    onTaskComplete(
      TASK_STATUS.STUDY_DONE,
      '📖 学习结果',
      '📖 学习任务完成\n已掌握新知识点：竞品分析进阶方法\n技能"信息检索"经验 +15',
      10000
    )
    setTimeout(() => {
      if (curStatus === TASK_STATUS.STUDY_DONE) setStatus(TASK_STATUS.IDLE)
    }, 5000)
  }

  /* ═══ 菜地工作场动画层 ═══ */
  function updateFarmLayer(st) {
    if (!farmLayer) return
    var isActive = [TASK_STATUS.WORKING, TASK_STATUS.STUDY].includes(st)

    if (isActive) {
      startFarmAnimation()
      if (st === TASK_STATUS.STUDY) {
        if (farmStatusLabel) farmStatusLabel.textContent = '学习中…'
      } else {
        if (farmStatusLabel) farmStatusLabel.textContent = '菜地执行中…'
      }
    } else {
      stopFarmAnimation()
    }
  }

  var farmAnimState = 'hoe'
  function startFarmAnimation() {
    farmLayer.classList.remove('farm-paused')
    setFarmAnim('hoe')
    clearInterval(farmAnimTimer)
    farmAnimTimer = setInterval(function () {
      farmAnimState = farmAnimState === 'hoe' ? 'pick' : 'hoe'
      setFarmAnim(farmAnimState)
    }, 4000)
  }

  function setFarmAnim(mode) {
    if (mode === 'hoe') {
      farmLayer.classList.add('farm-active')
      farmLayer.classList.remove('farm-picking')
      if (farmToolEmoji) farmToolEmoji.textContent = '🪓'
      // 状态文案由 updateFarmLayer 控制，此处不覆盖
    } else {
      farmLayer.classList.remove('farm-active')
      farmLayer.classList.add('farm-picking')
      if (farmToolEmoji) farmToolEmoji.textContent = '🥬'
    }
  }

  function stopFarmAnimation() {
    clearInterval(farmAnimTimer)
    farmLayer.classList.remove('farm-active', 'farm-picking')
    farmLayer.classList.add('farm-paused')
  }

  /* ═══ 长任务（执行） ═══ */
  function startWork() {
    startNewConversation()
    setStatus(TASK_STATUS.WORKING)
  }

  function finishWork() {
    if (curStatus !== TASK_STATUS.WORKING && curStatus !== TASK_STATUS.STUDY) {
      startWork()
      setTimeout(finishWork, 1500)
      return
    }
    stopFarmAnimation()
    if (farmStatusLabel) farmStatusLabel.textContent = '任务执行完毕！'

    onTaskComplete(
      TASK_STATUS.WORK_DONE,
      '📊 任务结果',
      '📊 任务执行报告\n已完成全面分析，核心发现 3 项，建议行动 2 项。\n• 数据覆盖率：98%\n• 关键洞察已标记',
      10000
    )
    setTimeout(() => {
      if (curStatus === TASK_STATUS.WORK_DONE) setStatus(TASK_STATUS.IDLE)
    }, 4000)
  }

  /* ═══ 右侧对话浮层（摘要 / 完整两种模式） ═══ */
  var chatPanelMode = 'full'

  // 构建摘要数据（含 conversationId）
  function buildSummaryPairs() {
    var pairs = []
    var currentPair = null
    chatHistory.forEach(function (msg) {
      if (msg.role === 'user') {
        currentPair = { user: msg, ai: null, conversationId: msg.conversationId }
        pairs.push(currentPair)
      } else if (msg.role === 'ai' || msg.role === 'system') {
        if (currentPair && !currentPair.ai) {
          currentPair.ai = msg
        } else {
          pairs.push({ user: null, ai: msg, conversationId: msg.conversationId })
        }
      }
    })
    return pairs
  }

  // 渲染摘要视图
  function renderChatSummary() {
    chatLabel.textContent = '🕐 对话摘要'
    if (chatHistory.length === 0) {
      chatBody.innerHTML = '<div class="chat-summary__empty"><span class="chat-summary__empty-icon">🕐</span><p class="chat-summary__empty-text">暂无对话记录</p></div>'
      return
    }
    var pairs = buildSummaryPairs()
    var reversed = pairs.slice().reverse()
    var html = ''
    reversed.forEach(function (pair, i) {
      var icon = pair.user ? '💬' : (pair.ai && pair.ai.role === 'system' ? '⚠️' : '🤖')
      var title = pair.user ? esc(pair.user.text).substring(0, 40) : (pair.ai ? esc(pair.ai.text).substring(0, 40) : '...')
      var preview = pair.ai ? esc(pair.ai.text).substring(0, 50) : '等待回复…'
      var time = pair.ai ? pair.ai.time : (pair.user ? pair.user.time : '')
      var convId = pair.conversationId || ''
      html += '<div class="chat-summary-item chat-summary-item--clickable" data-summary-idx="' + i + '" data-conversation-id="' + convId + '">'
        + '<span class="chat-summary-item__icon">' + icon + '</span>'
        + '<div class="chat-summary-item__content">'
        + '<div class="chat-summary-item__title">' + title + '</div>'
        + '<div class="chat-summary-item__preview">' + preview + '</div>'
        + '</div>'
        + '<span class="chat-summary-item__time">' + time + '</span>'
        + '<span class="chat-summary-item__arrow">›</span>'
        + '</div>'
    })
    chatBody.innerHTML = html
    chatBody.scrollTop = 0

    chatBody.querySelectorAll('.chat-summary-item--clickable').forEach(function (item) {
      item.addEventListener('click', function () {
        var convId = item.dataset.conversationId
        chatPanelMode = 'full'
        renderChatFull(convId) // 传入 conversationId 进行定位
      })
    })
  }

  // 渲染完整对话视图（支持滚动定位到指定 conversationId）
  function renderChatFull(scrollToConvId) {
    chatLabel.textContent = '💬 完整对话'
    if (chatHistory.length === 0) {
      chatBody.innerHTML = '<div style="text-align:center;padding:40px 0;"><span style="font-size:24px;display:block;margin-bottom:8px;">💬</span><p style="color:rgba(30,40,50,0.35);font-size:12px;">暂无对话记录</p></div>'
      return
    }
    var html = ''
    html += '<button class="chat-back-to-summary" id="chat-back-summary">← 返回摘要</button>'

    chatHistory.forEach(function (msg, idx) {
      var cls = msg.role === 'user' ? 'chat-msg--user' : (msg.role === 'system' ? 'chat-msg--system' : 'chat-msg--ai')
      var escaped = esc(msg.text).replace(/\n/g, '<br>')
      var highlight = (scrollToConvId && msg.conversationId === scrollToConvId) ? ' chat-msg--highlight' : ''
      html += '<div class="chat-msg ' + cls + highlight + '" data-msg-idx="' + idx + '" data-conversation-id="' + (msg.conversationId || '') + '">'
        + '<span class="chat-msg__time">' + msg.time + '</span>'
        + escaped
        + '</div>'
    })

    // 如果考试状态是 waiting_confirm，在底部插入"同意开考"操作按钮
    if (examState === EXAM_STATE.WAITING_CONFIRM) {
      html += '<div class="exam-confirm-area">'
        + '<button class="exam-confirm-btn">✅ 同意开考</button>'
        + '<span class="exam-confirm-hint">点击确认后将进入森林试炼场</span>'
        + '</div>'
    }

    chatBody.innerHTML = html
    chatBody.scrollTop = chatBody.scrollHeight

    // 滚动定位到指定对话
    if (scrollToConvId) {
      var targetEl = chatBody.querySelector('[data-conversation-id="' + scrollToConvId + '"]')
      if (targetEl) {
        setTimeout(function () {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // 高亮动画
          targetEl.classList.add('chat-msg--flash')
          setTimeout(function () {
            targetEl.classList.remove('chat-msg--flash')
          }, 2000)
        }, 100)
      }
    }

    // 绑定返回摘要按钮
    var backBtn2 = chatBody.querySelector('#chat-back-summary')
    if (backBtn2) {
      backBtn2.addEventListener('click', function () {
        chatPanelMode = 'summary'
        renderChatSummary()
      })
    }
  }

  // 系统自动弹出
  function openChatPanel(label, autoCloseMs) {
    closeAllContainers('chat')
    chatUserTouch = false
    chatPanelMode = 'full'
    chatLabel.textContent = label || '💬 对话'
    renderChatFull()
    chatPanel.classList.add('open')
    chatBD.classList.add('visible')
    if (chatPullTab) chatPullTab.classList.add('hidden')
    clearTimeout(chatAutoTimer)
    if (autoCloseMs > 0) {
      chatAutoTimer = setTimeout(function () { if (!chatUserTouch) closeChatPanel() }, autoCloseMs)
    }
  }

  function openChatPanelSummary() {
    closeAllContainers('chat')
    chatUserTouch = true
    chatPanelMode = 'summary'
    renderChatSummary()
    chatPanel.classList.add('open')
    chatBD.classList.add('visible')
    if (chatPullTab) chatPullTab.classList.add('hidden')
    clearTimeout(chatAutoTimer)
  }

  function openChatPanelFull() {
    closeAllContainers('chat')
    chatUserTouch = true
    chatPanelMode = 'full'
    renderChatFull()
    chatPanel.classList.add('open')
    chatBD.classList.add('visible')
    if (chatPullTab) chatPullTab.classList.add('hidden')
    clearTimeout(chatAutoTimer)
  }

  function closeChatPanel() {
    chatPanel.classList.remove('open')
    chatBD.classList.remove('visible')
    if (chatPullTab) chatPullTab.classList.remove('hidden')
    clearTimeout(chatAutoTimer)
    chatUserTouch = false
  }

  function onChatTouch() { chatUserTouch = true; clearTimeout(chatAutoTimer) }

  /* ═══ 容器互斥 ═══ */
  function closeAllContainers(except) {
    if (except !== 'event')   closeEvModal()
    if (except !== 'diary')   closeDiaryModal()
    if (except !== 'hotspot') closeHsModal()
    if (except !== 'growth')  closeGrowthModal()
    if (except !== 'health')  closeHealthModal()
    if (except !== 'chat')    closeChatPanel()
  }

  /* ═══ 热点弹层 ═══ */
  function openHsModal(key) {
    var c = HOTSPOT[key]; if (!c) return
    if (c.modal === 'birth-event') { openEventModal('birth'); return }
    if (c.modal === 'diary') { openDiaryModal(); return }
    if (c.modal === 'growth') { openGrowthModal(); return }
    if (c.modal === 'health') { openHealthModal(); return }
    if (c.modal === 'chat-history') { openChatPanelSummary(); return }
    closeAllContainers('hotspot')
    hsTitle.textContent = c.title
    hsBody.innerHTML = c.body ? c.body : '<div class="modal-placeholder"><span class="modal-placeholder__icon">' + c.icon + '</span><p class="modal-placeholder__text">后续接入完整数据</p></div>'
    hsModal.classList.add('open')
  }
  function closeHsModal() { hsModal.classList.remove('open') }

  /* ═══ 离线日记册 ═══ */
  var diaryModal = $('#diary-modal'), diaryBody = $('#diary-modal-body')
  var diaryClose = $('#diary-modal-close'), diaryBD = $('#diary-modal-bd')
  var diaryPrev = $('#diary-prev'), diaryNext = $('#diary-next'), diaryIndicator = $('#diary-indicator')

  var DIARY_ENTRIES = [
    { date: '2026-03-30 22:15', title: '今天有点忙', body: '主人今天连续给了三个长任务，我在菜地忙了好久。不过都顺利完成了，感觉自己的数据分析能力又进步了一点。', tag: '成长复盘' },
    { date: '2026-03-29 21:40', title: '发现了新偏好', body: '主人似乎特别喜欢看竞品分析类的报告，最近连续三次都让我做这个方向的任务。我记住了，下次可以主动推荐。', tag: '偏好变化' },
    { date: '2026-03-28 23:05', title: '第一天', body: '今天是我出生的日子。主人给我取名叫小钳，还带我熟悉了池塘。虽然什么都还不太懂，但我会努力学习的！', tag: '第一天' },
  ]

  var diaryIndex = 0

  function renderDiaryPage() {
    var entry = DIARY_ENTRIES[diaryIndex]
    if (!entry) return
    diaryBody.innerHTML =
      '<div class="diary-page">'
      + '<div class="diary-page__date">' + esc(entry.date) + '</div>'
      + (entry.title ? '<h4 class="diary-page__title">' + esc(entry.title) + '</h4>' : '')
      + '<p class="diary-page__body">' + esc(entry.body) + '</p>'
      + '<span class="diary-page__tag">' + esc(entry.tag) + '</span>'
      + '</div>'
    diaryIndicator.textContent = (diaryIndex + 1) + ' / ' + DIARY_ENTRIES.length
    diaryPrev.disabled = diaryIndex <= 0
    diaryNext.disabled = diaryIndex >= DIARY_ENTRIES.length - 1
  }

  function openDiaryModal() {
    closeAllContainers('diary')
    diaryIndex = 0
    renderDiaryPage()
    diaryModal.classList.add('open')
    setUnread(false)
  }
  function closeDiaryModal() { diaryModal.classList.remove('open') }

  diaryClose.addEventListener('click', closeDiaryModal)
  diaryBD.addEventListener('click', closeDiaryModal)
  diaryPrev.addEventListener('click', function () { if (diaryIndex > 0) { diaryIndex--; renderDiaryPage() } })
  diaryNext.addEventListener('click', function () { if (diaryIndex < DIARY_ENTRIES.length - 1) { diaryIndex++; renderDiaryPage() } })

  /* ═══ 成长档案弹层 ═══ */
  function openGrowthModal() {
    closeAllContainers('growth')
    renderSkillTreeTab() // 动态渲染技能树
    growthModal.classList.add('open')
  }
  function closeGrowthModal() { growthModal.classList.remove('open') }

  growthTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.tab
      growthTabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === target) })
      growthPanels.forEach(function (p) { p.classList.toggle('active', p.dataset.panel === target) })
      if (target === 'skill') renderSkillTreeTab()
    })
  })

  growthClose.addEventListener('click', closeGrowthModal)
  growthBD.addEventListener('click', closeGrowthModal)

  // 动态渲染技能树（7 维度）
  function renderSkillTreeTab() {
    var container = document.querySelector('[data-panel="skill"] .growth-skill-tree')
    if (!container) return
    var html = ''
    SKILL_TREE_DATA.forEach(function (group) {
      html += '<div class="growth-skill-group" data-skill-group="' + group.id + '">'
        + '<h4 class="growth-skill-group__title"><span class="growth-skill-group__icon">' + group.icon + '</span>' + esc(group.name) + '</h4>'
        + '<div class="growth-skill-group__tags">'
      group.skills.forEach(function (skill) {
        if (skill.unlocked) {
          html += '<span class="growth-skill-tag" data-primary-skill="' + (skill.primary_skill || '') + '" data-secondary-skills="' + (skill.secondary_skills || []).join(',') + '">'
            + esc(skill.name)
            + ' <em>Lv.' + skill.level + '</em>'
            + '</span>'
        } else {
          html += '<span class="growth-skill-tag growth-skill-tag--locked" data-primary-skill="' + (skill.primary_skill || '') + '">'
            + esc(skill.name)
            + '</span>'
        }
      })
      html += '</div></div>'
    })
    container.innerHTML = html
  }

  // 证书夹卡片点击
  document.querySelectorAll('.growth-cert--clickable').forEach(function (card) {
    card.addEventListener('click', function () {
      var certKey = card.dataset.cert
      if (certKey === 'birth') {
        closeGrowthModal()
        setTimeout(function () { openEventModal('birth') }, 200)
      }
    })
  })

  /* ═══ 健康看板弹层（5 区块） ═══ */
  var healthModal = $('#health-modal'), healthBody = $('#health-modal-body')
  var healthClose = $('#health-modal-close'), healthBD = $('#health-modal-bd')

  function renderHealthPanel() {
    var d = HEALTH_DATA
    var html = ''

    // 区块 1：当前状态
    html += '<div class="health-section">'
      + '<h4 class="health-section__title">当前状态</h4>'
      + '<div class="health-grid">'
      + '<div class="health-item"><span class="health-item__label">龙虾状态</span><span class="health-item__value health-item__value--ok">🟢 ' + esc(d.current.state) + '</span></div>'
      + '<div class="health-item"><span class="health-item__label">当前场景</span><span class="health-item__value">' + esc(d.current.scene) + '</span></div>'
      + '<div class="health-item"><span class="health-item__label">使用的模型</span><span class="health-item__value">' + esc(d.current.model) + '</span></div>'
      + '<div class="health-item"><span class="health-item__label">运行时长</span><span class="health-item__value health-item__value--dim">' + esc(d.current.uptime) + '</span></div>'
      + '</div></div>'

    // 区块 2：活跃情况
    html += '<div class="health-section">'
      + '<h4 class="health-section__title">活跃情况</h4>'
      + '<div class="health-grid">'
      + '<div class="health-item"><span class="health-item__label">活跃会话数</span><span class="health-item__value">' + d.activity.activeSessions + '</span></div>'
      + '<div class="health-item"><span class="health-item__label">当前进行中的任务</span><span class="health-item__value">' + esc(d.activity.currentTask) + '</span></div>'
      + '<div class="health-item"><span class="health-item__label">今日任务数</span><span class="health-item__value">' + d.activity.todayTasks + '</span></div>'
      + '</div></div>'

    // 区块 3：Token 概览
    html += '<div class="health-section">'
      + '<h4 class="health-section__title">Token 概览</h4>'
      + '<div class="health-grid">'
      + '<div class="health-item"><span class="health-item__label">总 token 用量</span><span class="health-item__value">' + esc(d.tokens.total) + '</span></div>'
      + '<div class="health-item"><span class="health-item__label">日均 token 用量</span><span class="health-item__value health-item__value--dim">' + esc(d.tokens.daily) + '</span></div>'
      + '<div class="health-item"><span class="health-item__label">今日 token 用量</span><span class="health-item__value">' + esc(d.tokens.today) + '</span></div>'
      + '</div></div>'

    // 区块 4：趋势图
    html += '<div class="health-section">'
      + '<h4 class="health-section__title">趋势图</h4>'
      + renderBarChart('token 日趋势', d.trend.dailyData, d.trend.dailyLabels, '#6ee7b7')
      + renderBarChart('token 周趋势', d.trend.weeklyData, d.trend.weeklyLabels, '#60a5fa')
      + '</div>'

    // 区块 5：结构分布
    html += '<div class="health-section">'
      + '<h4 class="health-section__title">结构分布</h4>'
      + '<div class="health-pie-chart">'
      + renderPieChart(d.distribution)
      + '</div>'
      + '<div class="health-pie-legend">'
      + '<span class="health-pie-legend__item"><span class="health-pie-dot" style="background:#6ee7b7;"></span>对话消耗 ' + d.distribution.dialog + '%</span>'
      + '<span class="health-pie-legend__item"><span class="health-pie-dot" style="background:#60a5fa;"></span>执行消耗 ' + d.distribution.execution + '%</span>'
      + '<span class="health-pie-legend__item"><span class="health-pie-dot" style="background:#fbbf24;"></span>工具/检索消耗 ' + d.distribution.tools + '%</span>'
      + '</div>'
      + '</div>'

    healthBody.innerHTML = html
  }

  // 简易柱状图
  function renderBarChart(title, data, labels, color) {
    var max = Math.max.apply(null, data) || 1
    var html = '<div class="health-bar-chart">'
      + '<div class="health-bar-chart__title">' + esc(title) + '</div>'
      + '<div class="health-bar-chart__bars">'
    data.forEach(function (val, i) {
      var pct = Math.round((val / max) * 100)
      html += '<div class="health-bar-chart__col">'
        + '<div class="health-bar-chart__bar" style="height:' + pct + '%;background:' + color + ';"></div>'
        + '<span class="health-bar-chart__label">' + (labels[i] || '') + '</span>'
        + '</div>'
    })
    html += '</div></div>'
    return html
  }

  // 简易饼图（CSS conic-gradient）
  function renderPieChart(dist) {
    var d1 = dist.dialog
    var d2 = dist.execution
    var d3 = dist.tools
    var gradient = 'conic-gradient(#6ee7b7 0% ' + d1 + '%, #60a5fa ' + d1 + '% ' + (d1 + d2) + '%, #fbbf24 ' + (d1 + d2) + '% 100%)'
    return '<div class="health-pie" style="background:' + gradient + ';"></div>'
  }

  function openHealthModal() {
    closeAllContainers('health')
    renderHealthPanel()
    healthModal.classList.add('open')
  }
  function closeHealthModal() { healthModal.classList.remove('open') }

  healthClose.addEventListener('click', closeHealthModal)
  healthBD.addEventListener('click', closeHealthModal)

  /* ═══ 事件弹窗 ═══ */
  function openEventModal(key) {
    var ev = EVT_CARDS[key]; if (!ev) return
    closeAllContainers('event')
    if (ev.type === 'birth') evCard.innerHTML = ev.html
    else evCard.innerHTML = '<div class="event-card-generic"><span class="event-card-generic__icon">' + ev.icon + '</span><h2 class="event-card-generic__title">' + ev.title + '</h2><p class="event-card-generic__body">' + ev.body + '</p><button class="event-card-generic__close-btn" data-event-close>知道了</button></div>'
    evModal.classList.add('open')
    evCard.querySelectorAll('[data-event-close]').forEach(function (cb) {
      cb.addEventListener('click', closeEvModal)
    })
  }
  function closeEvModal() { evModal.classList.remove('open') }

  /* ═══ 角色反馈 ═══ */
  function triggerReaction() {
    var r = REACTIONS[Math.random() * REACTIONS.length | 0], b = BUBBLES[Math.random() * BUBBLES.length | 0]
    charSprite.classList.remove('reaction--roll', 'reaction--wiggle', 'reaction--bubble')
    void charSprite.offsetWidth
    charSprite.classList.add('reaction--' + r)
    bubText.textContent = b; charBubble.classList.add('visible')
    setTimeout(function () { charSprite.classList.remove('reaction--' + r) }, 900)
    setTimeout(function () { charBubble.classList.remove('visible') }, 1800)
  }

  /* ═══ 小本子未读 ═══ */
  function setUnread(v) { diaryUnread = v; unreadBadge.classList.toggle('active', v) }

  /* ═══ 输入框 — 任务分类 ═══ */
  var LONG_TASK_KEYWORDS = ['分析', '视频', '抓取', '竞品', '拆解', '文章', '总结', '资料', '报告', '调研', '爬取', '对比', '整理']

  function isLongTask(text) {
    return LONG_TASK_KEYWORDS.some(function (kw) { return text.includes(kw) })
  }

  function handleSend() {
    var v = taskInput.value.trim(); if (!v) return; taskInput.value = ''

    // 如果当前正在等待考试确认，且用户输入了"同意"
    if (examState === EXAM_STATE.WAITING_CONFIRM) {
      var confirmWords = ['同意', '好的', '确认', '开始', 'ok', 'yes', '好', '同意开考']
      if (confirmWords.some(function (w) { return v.toLowerCase() === w })) {
        examConfirmStart()
        return
      }
    }

    startNewConversation()
    addChatMessage('user', v)

    if (isLongTask(v)) {
      if (curScene === SCENES.POND) triggerReaction()
      statusTextEl.textContent = '收到长任务，准备出发…'
      setTimeout(function () { startWork() }, 800)
      if (DEMO_CONFIG.isDemo) {
        setTimeout(function () { finishWork() }, DEMO_CONFIG.workResultTimeoutDemo + 800)
      }
    } else {
      var orig = statusTextEl.textContent
      statusTextEl.textContent = '收到！正在回复…'
      if (curScene === SCENES.POND) triggerReaction()
      setTimeout(function () {
        statusTextEl.textContent = orig
        addChatMessage('ai', '收到「' + v + '」，这是模拟回复。后续接入 AI 对话。')
        openChatPanel('💬 回复', 3000)
      }, 800)
    }
  }

  /* ═══ DEV 面板 ═══ */
  var devVisible = false
  function toggleDev() {
    devVisible = !devVisible
    devToolbar.classList.toggle('dev-toolbar--hidden', !devVisible)
  }

  function updateDevActive() {
    devBtns.forEach(function (b) {
      if (!b.disabled) b.classList.toggle('active', b.dataset.target === curScene)
    })
  }

  function handleDev(t) {
    onUserActivity()
    switch (t) {
      case 'pond': resetExam(); setStatus(TASK_STATUS.IDLE); break
      case 'forest': setStatus(TASK_STATUS.EXAM); break
      case 'farm': setStatus(TASK_STATUS.WORKING); break
      case 'alert': triggerError(); break
      case 'recover': recoverError(); break
      case 'birth': openEventModal('birth'); break
      case 'qa': taskInput.value = '今天天气怎么样？'; handleSend(); break
      case 'long-task': taskInput.value = '帮我分析这个视频'; handleSend(); break
      case 'toggle-unread': setUnread(!diaryUnread); break
      case 'start-exam': startExam(); break
      case 'confirm-exam': examConfirmStart(); break
      case 'finish-exam': finishExam(); break
      case 'start-work': startWork(); break
      case 'finish-work': finishWork(); break
      case 'start-study': startStudy(); break
      case 'finish-study': finishStudy(); break
    }
  }

  /* ═══ 工具 ═══ */
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML }

  /* ═══ 龙虾 hover 操作菜单 ═══ */
  var charActionsTimer = null
  var charMenuOpen = false
  var pondHotspots = document.querySelector('.pond-hotspots')

  function showCharActions() {
    clearTimeout(charActionsTimer)
    charActions.classList.add('staying')
    if (!charMenuOpen) {
      charMenuOpen = true
      if (pondHotspots) pondHotspots.classList.add('char-menu-open')
    }
  }

  function hideCharActionsDelayed() {
    clearTimeout(charActionsTimer)
    charActionsTimer = setTimeout(function () {
      charActions.classList.remove('staying')
      charMenuOpen = false
      if (pondHotspots) pondHotspots.classList.remove('char-menu-open')
    }, 300)
  }

  pondChar.addEventListener('mouseenter', showCharActions)
  pondChar.addEventListener('mouseleave', hideCharActionsDelayed)
  charActions.addEventListener('mouseenter', function () { clearTimeout(charActionsTimer) })
  charActions.addEventListener('mouseleave', hideCharActionsDelayed)

  // 操作按钮行为
  charActions.querySelectorAll('.char-actions__btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation()
      var action = btn.dataset.action

      if (action === 'bath') {
        triggerReaction()
        bubText.textContent = '泡个舒服的澡~ 🫧'
        charBubble.classList.add('visible')
        statusTextEl.textContent = '泡澡中…'
        topBarStatusText.textContent = '泡澡休息中'
        hideCharActionsDelayed()
        setTimeout(function () {
          charBubble.classList.remove('visible')
          if (curStatus === TASK_STATUS.IDLE) {
            statusTextEl.textContent = STATUS_TEXT[TASK_STATUS.IDLE]
            topBarStatusText.textContent = TOPBAR_STATUS_TEXT[TASK_STATUS.IDLE]
          }
        }, 3000)
      } else if (action === 'study') {
        // 学习 → 切到菜地工作场
        charActions.classList.remove('staying')
        charMenuOpen = false
        if (pondHotspots) pondHotspots.classList.remove('char-menu-open')
        startStudy()
      } else if (action === 'exam') {
        // 考试 → 发起考试确认（阶段 1，不切换场景）
        charActions.classList.remove('staying')
        charMenuOpen = false
        if (pondHotspots) pondHotspots.classList.remove('char-menu-open')
        triggerReaction()
        bubText.textContent = '准备参加考试~ 📝'
        charBubble.classList.add('visible')
        setTimeout(function () { charBubble.classList.remove('visible') }, 1500)
        startExam()
      }
    })
  })

  // 考试超时 → 回到池塘按钮
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'exam-back-to-pond') {
      examBackToPond()
    }
  })

  // 聊天浮层中的"同意开考"按钮
  document.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('exam-confirm-btn')) {
      examConfirmStart()
    }
  })

  /* ═══ 事件绑定 ═══ */
  hotspots.forEach(function (b) {
    b.addEventListener('click', function () { openHsModal(b.dataset.hotspot) })
  })

  hsClose.addEventListener('click', closeHsModal)
  hsBD.addEventListener('click', closeHsModal)
  evBD.addEventListener('click', closeEvModal)

  sendBtn.addEventListener('click', handleSend)
  taskInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) handleSend() })

  chatClose.addEventListener('click', closeChatPanel)
  chatBD.addEventListener('click', closeChatPanel)
  chatPanel.addEventListener('mouseenter', onChatTouch)
  chatPanel.addEventListener('click', onChatTouch)
  chatBody.addEventListener('scroll', onChatTouch)
  chatPanel.addEventListener('touchstart', onChatTouch, { passive: true })

  if (chatPullTab) {
    chatPullTab.addEventListener('click', function () { openChatPanelFull() })
  }

  backBtn.addEventListener('click', goBackToPond)
  devToggle.addEventListener('click', toggleDev)
  devBtns.forEach(function (b) { b.addEventListener('click', function () { if (!b.disabled) handleDev(b.dataset.target) }) })

  ;['click', 'touchstart', 'keydown', 'mousemove'].forEach(function (evt) {
    document.addEventListener(evt, onUserActivity, { passive: true })
  })

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeHsModal(); closeEvModal(); closeGrowthModal(); closeDiaryModal(); closeHealthModal(); closeChatPanel() }
    if (e.key === '`' || e.key === '~') { toggleDev(); return }
    if (document.activeElement === taskInput) return
    if (!devVisible) return
    var map = { '1': 'pond', '2': 'forest', '3': 'farm', '4': 'alert', '5': 'recover', '6': 'birth', '7': 'qa', '8': 'long-task', '9': 'start-exam', '0': 'finish-exam' }
    if (map[e.key]) handleDev(map[e.key])
  })

  /* ═══ 初始化 ═══ */
  setStatus(TASK_STATUS.IDLE)
  topBarSceneName.textContent = SCENE_NAMES[SCENES.POND]

  /* ═══ 页面可见性优化：标签页隐藏时暂停所有动画 ═══ */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      // 暂停所有场景
      if (window._phaserSwitchScene) {
        ['pond', 'forest', 'farm'].forEach(function (s) {
          if (window._phaserInstances && window._phaserInstances[s]) {
            var game = window._phaserInstances[s]
            if (game.loop && !game.loop.sleeping) game.loop.sleep()
          }
        })
      }
      if (window._spriteAnimSwitchScene) window._spriteAnimSwitchScene(null) // null = 暂停所有
      console.log('[性能] 标签页隐藏，暂停所有动画')
    } else {
      // 恢复当前场景
      if (window._phaserSwitchScene) window._phaserSwitchScene(curScene)
      if (window._spriteAnimSwitchScene) window._spriteAnimSwitchScene(curScene)
      console.log('[性能] 标签页可见，恢复场景:', curScene)
    }
  })

  console.log('%c🦞 LightClaw v10.2 · 性能优化版', 'color:#6ee7b7;font-size:14px;font-weight:bold;')
  console.log('优化项: Phaser 懒加载 · 场景级暂停/恢复 · 页面可见性感知')
  console.log('考试配置: examDemoMode=' + DEMO_CONFIG.examDemoMode + ', examDemoDuration=' + DEMO_CONFIG.examDemoDuration + 'ms')
})()
