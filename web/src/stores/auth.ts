import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/index.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('access_token'))
  const user = ref<{ id: number; email: string; username: string } | null>(null)

  const isLoggedIn = computed(() => !!token.value)

  async function login(email: string, password: string) {
    const res = await authApi.login({ email, password })
    token.value = res.data.access_token
    localStorage.setItem('access_token', token.value)
    await fetchMe()
  }

  async function register(email: string, username: string, password: string) {
    await authApi.register({ email, username, password })
    await login(email, password)
  }

  async function fetchMe() {
    try {
      const res = await authApi.me()
      user.value = res.data
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('access_token')
  }

  return { token, user, isLoggedIn, login, register, fetchMe, logout }
})
