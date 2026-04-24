import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 根路径：已登录跳龙虾静态页，未登录跳登录页
    {
      path: '/',
      beforeEnter: () => {
        const auth = useAuthStore()
        if (auth.isLoggedIn) {
          window.location.href = '/lobster/'
          return false
        }
        return '/login'
      },
      component: () => import('../views/Login.vue'),
    },
    { path: '/login', component: () => import('../views/Login.vue') },
    { path: '/register', component: () => import('../views/Register.vue') },
    // 管理员调试入口：原 Dashboard / AgentDetail，改挂到 /admin 前缀
    {
      path: '/admin',
      component: () => import('../views/Dashboard.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/agents/:id',
      component: () => import('../views/AgentDetail.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return '/login'
  }
})

export default router
