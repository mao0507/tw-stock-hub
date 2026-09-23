import { z } from 'zod'

const strongPassword = z
  .string()
  .min(8, '密碼至少 8 個字元')
  .regex(/[A-Z]/, '密碼需含大寫字母')
  .regex(/[a-z]/, '密碼需含小寫字母')
  .regex(/[0-9]/, '密碼需含數字')

export const loginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(1, '請輸入密碼'),
})

export const registerSchema = z
  .object({
    email: z.string().email('請輸入有效的電子郵件'),
    password: strongPassword,
    confirmPassword: z.string(),
    nickname: z
      .string()
      .min(2, '暱稱至少 2 個字元')
      .max(20, '暱稱最多 20 個字元'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '兩次輸入的密碼不一致',
    path: ['confirmPassword'],
  })

export const updateUserSchema = z
  .object({
    nickname: z
      .string()
      .min(2, '暱稱至少 2 個字元')
      .max(20, '暱稱最多 20 個字元')
      .optional(),
    currentPassword: z.string().optional(),
    newPassword: strongPassword.optional(),
  })
  .refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) return false
      return true
    },
    { message: '請提供目前的密碼', path: ['currentPassword'] },
  )

export const addWatchlistSchema = z.object({
  stockId: z
    .string()
    .min(4, '股票代號格式不正確')
    .max(6, '股票代號格式不正確')
    .regex(/^\d+$/, '股票代號須為數字'),
  note: z.string().max(200, '備註最多 200 字').optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type UpdateUserFormData = z.infer<typeof updateUserSchema>
export type AddWatchlistFormData = z.infer<typeof addWatchlistSchema>
