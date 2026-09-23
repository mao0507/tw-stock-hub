import type { AuthResponse, User, UpdateUserForm } from '@tw-stock-hub/types'
import { authApiClient } from '../axios'

export const authApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await authApiClient.post<AuthResponse>('/api/auth/login', { email, password })
    return data
  },

  async register(email: string, password: string, nickname: string): Promise<AuthResponse> {
    const { data } = await authApiClient.post<AuthResponse>('/api/auth/register', {
      email, password, nickname,
    })
    return data
  },

  async refresh(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const { data } = await authApiClient.post('/api/auth/refresh', { refresh_token: refreshToken })
    return data
  },

  async logout(refreshToken: string): Promise<void> {
    await authApiClient.post('/api/auth/logout', { refresh_token: refreshToken })
  },

  getGoogleAuthUrl(): string {
    const base = authApiClient.defaults.baseURL ?? 'http://localhost:3001'
    return `${base}/api/auth/google`
  },

  async getMe(): Promise<User> {
    const { data } = await authApiClient.get<User>('/api/users/me')
    return data
  },

  async updateMe(form: UpdateUserForm): Promise<User> {
    const { data } = await authApiClient.patch<User>('/api/users/me', form)
    return data
  },

  async deleteAccount(): Promise<void> {
    await authApiClient.delete('/api/users/me')
  },
}
