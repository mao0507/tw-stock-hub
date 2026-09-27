import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import Calendar from './index.vue'

const today = new Date()
const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`

vi.mock('@tw-stock-hub/api-client', () => ({
  stockApi: { getExDividendCalendar: vi.fn() },
}))

import { stockApi } from '@tw-stock-hub/api-client'

describe('Calendar', () => {
  beforeEach(() => {
    vi.mocked(stockApi.getExDividendCalendar).mockResolvedValue([
      { exDate: ymd, stockId: '2330', stockName: '台積電', cashDividend: 5, stockDividendRatio: null },
      { exDate: ymd, stockId: '2884', stockName: '玉山金', cashDividend: 0.6, stockDividendRatio: 0.05 },
    ])
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('點選有除權息的日期彈出當日清單，股票連到個股頁', async () => {
    const w = mount(Calendar, {
      global: { stubs: { RouterLink: RouterLinkStub } },
      attachTo: document.body,
    })
    await flushPromises()
    // 預設依螢幕寬度可能是清單模式，切到月曆
    await w.findAll('button').find((b) => b.text() === '月曆')!.trigger('click')
    await flushPromises()

    await w.get('.cell-has').trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('15日')
    expect(dialog?.textContent).toContain('台積電')
    expect(dialog?.textContent).toContain('50 股') // 0.05 × 1000
    const links = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(links).toEqual(['/stocks/2330', '/stocks/2884'])
  })
})
