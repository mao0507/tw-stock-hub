import { z, type ZodTypeAny } from 'zod'

export function apiResponseSchema<T extends ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    timestamp: z.string(),
  })
}

export function paginatedResponseSchema<T extends ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
}

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.string()).optional(),
  }),
  timestamp: z.string(),
  path: z.string(),
})

export function safeParseResponse<T extends ZodTypeAny>(
  data: unknown,
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data as z.infer<T> }
  }
  console.warn('[Schema Validation] Failed:', result.error.flatten())
  return { success: false, error: result.error }
}
