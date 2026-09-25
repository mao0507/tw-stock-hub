export const STOCK_COLORS = {
  up: '#c2412d',
  upSoft: 'rgba(194, 65, 45, 0.12)',
  upMid: 'rgba(194, 65, 45, 0.28)',
  down: '#1c7c54',
  downSoft: 'rgba(28, 124, 84, 0.12)',
  downMid: 'rgba(28, 124, 84, 0.28)',
  flat: '#75706a',
  grid: '#ebe4d6',
  text: '#3a3833',
  textLight: '#75706a',
  // 中性強調：墨綠（非漲跌語意的線，例如累計、指數）
  blue: '#1f4d3a',
  blueSoft: 'rgba(31, 77, 58, 0.1)',
} as const

export const BASE_ECHARTS_OPTION = {
  animation: true,
  animationDuration: 400,
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'Noto Sans TC', sans-serif",
    color: STOCK_COLORS.text,
    fontSize: 12,
  },
  grid: {
    top: 16,
    right: 16,
    bottom: 40,
    left: 60,
    containLabel: false,
  },
  xAxis: {
    type: 'category',
    axisLine: { lineStyle: { color: STOCK_COLORS.grid } },
    axisTick: { show: false },
    axisLabel: { color: STOCK_COLORS.textLight, fontSize: 11, margin: 8 },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: STOCK_COLORS.textLight, fontSize: 11, margin: 8 },
    splitLine: { lineStyle: { color: STOCK_COLORS.grid, type: 'dashed' } },
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#1d2420',
    borderColor: 'transparent',
    textStyle: { color: '#fff', fontSize: 12 },
    axisPointer: {
      type: 'cross',
      crossStyle: { color: STOCK_COLORS.textLight },
      lineStyle: { color: STOCK_COLORS.grid, type: 'dashed' },
    },
  },
} as const

export const INSTITUTIONAL_COLORS = {
  buy: STOCK_COLORS.up,
  sell: STOCK_COLORS.down,
  cumulative: STOCK_COLORS.blue,
}

export const MARGIN_COLORS = {
  margin: STOCK_COLORS.up,
  short: STOCK_COLORS.down,
  increase: STOCK_COLORS.upSoft,
  decrease: STOCK_COLORS.downSoft,
}

/** 配置比例色票：墨綠為主的沉穩色（不帶漲跌語意） */
export const PIE_PALETTE = [
  '#1f4d3a', '#4f7f69', '#b7791f', '#2f5d8a', '#8aa89a',
  '#6b4f8a', '#c9a15e', '#5d8aa8', '#a3b8a5', '#8c6d4f', '#cdc4b1',
]
