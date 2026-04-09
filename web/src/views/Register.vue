<template>
  <div class="auth-page">
    <div class="auth-box card">
      <div class="auth-logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">ClawHome</span>
      </div>
      <h2 class="auth-title">创建账号</h2>

      <form @submit.prevent="onSubmit" class="auth-form">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input v-model="username" type="text" class="form-input" placeholder="你的名字" required />
        </div>
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input v-model="email" type="email" class="form-input" placeholder="you@example.com" required />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input v-model="password" type="password" class="form-input" placeholder="至少 8 位" required minlength="8" />
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
          {{ loading ? '注册中…' : '注册' }}
        </button>
      </form>

      <p class="auth-switch">
        已有账号？<router-link to="/login">去登录</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await auth.register(email.value, username.value, password.value)
    router.push('/dashboard')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    error.value = err.response?.data?.detail || '注册失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.auth-box { width: 100%; max-width: 400px; }
.auth-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
.logo-icon { font-size: 24px; }
.logo-text { font-size: 20px; font-weight: 700; color: #6366f1; }
.auth-title { font-size: 22px; font-weight: 700; margin-bottom: 24px; }
.auth-form { display: flex; flex-direction: column; gap: 16px; }
.w-full { width: 100%; justify-content: center; padding: 10px; font-size: 15px; }
.auth-switch { margin-top: 20px; text-align: center; font-size: 14px; color: #64748b; }
.auth-switch a { color: #6366f1; }
.auth-switch a:hover { text-decoration: underline; }
</style>
