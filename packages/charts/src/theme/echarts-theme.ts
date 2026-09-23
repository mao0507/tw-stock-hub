export const STOCK_COLORS = {
  up: '#e63950',
  upSoft: 'rgba(230, 57, 80, 0.12)',
  upMid: 'rgba(230, 57, 80, 0.28)',
  down: '#10b77a',
  downSoft: 'rgba(16, 183, 122, 0.12)',
  downMid: 'rgba(16, 183, 122, 0.28)',
  flat: '#8B919E',
  grid: '#ECEEF1',
  text: '#474C56',
  textLight: '#8B919E',
  blue: '#1A6CF5',
  blueSoft: 'rgba(26, 108, 245, 0.1)',
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
    backgroundColor: '#1C2833',
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
