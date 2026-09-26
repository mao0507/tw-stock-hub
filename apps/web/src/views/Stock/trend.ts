/** TrendChart 的序列型別（放在 .ts：ESLint 型別檢查讀不到 .vue 匯出的型別） */
export interface TrendSeries {
  name: string
  color: string
  data: { date: string; value: number | null }[]
}
