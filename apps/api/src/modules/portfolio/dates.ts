/** 台北時區的今天（YYYY-MM-DD） */
export const todayInTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
