import { expect, test } from 'claude-code/testing'

import { replay, summarize } from './register'

const BAND = { plugin: 'task-progress', component: 'AbovePrompt', props: { hasSurvey: false } } as const

test('plan của desktop app → dải tiến độ', { options: { language: 'vi' } }, async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const items = ['A', 'B', 'C', 'D', 'E'].map((c, i) => ({ content: c, status: i === 0 ? 'in_progress' : 'pending' }))
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true } as any)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await ui.find({ type: 'Text', text: /%$/ }))?.text).toBe('22%') // 20 + nấc bắt đầu B
  expect((await ui.find({ type: 'Text', text: /Đang làm/ }))?.text).toContain('B')
  await ui.unmount()
})

test('wrap_up của desktop app đánh dấu xong hết → 100%', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const items = ['A', 'B', '2.1 x', '2.2 y', 'C'].map((c, i) => ({ content: c, status: i === 0 ? 'in_progress' : 'pending' }))
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'xong' } as any)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await ui.find({ type: 'Text', text: /%$/ }))?.text).toBe('100%')
  await ui.unmount()
})

const setup = async ($: any, on: any) => {
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_: any, e: any) => e)
  on('turn.complete', () => ({ text: '' }))
  on('command.register', () => ({ value: { command: 'progress' } }))
  on('command.run', () => ({ text: '' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('env.get', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}
const plan = (names: string[], doneCount: number) =>
  names.map((c, i) => ({ content: c, status: i < doneCount ? 'completed' : i === doneCount ? 'in_progress' : 'pending' }))
const band = async ($: any) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  const pct = (await ui.find({ type: 'Text', text: /%$/ }))?.text
  const meta = (await ui.find({ type: 'Text', text: /bước lớn|main steps/ }))?.text
  await ui.unmount()
  return { pct, meta }
}
const turnEnd = (isAborted: boolean) =>
  ({ turnId: 't', isAborted, reason: isAborted ? 'aborted' : 'answer', answer: '', durationMs: 1 }) as any

test('cancel → giữ % và ghi đã dừng; lượt sau thêm bước → tính lại', { options: { language: 'vi' } }, async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: plan(['A', 'B', 'C', 'D'], 2) } as any)
  expect((await band($)).pct).toBe('53%')

  await $.turn.complete(turnEnd(true))
  const stopped = await band($)
  expect(stopped.pct).toBe('53%')
  expect(stopped.meta).toContain('Đã dừng')

  // Lượt sau: bổ sung 2 việc → 2/6 + nấc = 35%, hết "đã dừng".
  await $.prompt.submit({ text: 'làm tiếp, thêm E F' } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: plan(['A', 'B', 'C', 'D', 'E', 'F'], 2) } as any)
  const after = await band($)
  expect(after.pct).toBe('35%')
  expect(after.meta).not.toContain('Đã dừng')
})

test('cancel rồi lượt sau không đụng list → dọn thanh cũ', async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: plan(['A', 'B'], 1) } as any)
  await $.turn.complete(turnEnd(true))
  await $.prompt.submit({ text: 'hỏi chuyện khác' } as any)
  await $.turn.complete(turnEnd(false))
  expect((await band($)).pct).toBeUndefined()
})


test('tiếng Anh khi tuỳ chọn là en', { options: { language: 'en' } }, async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: plan(['Đếm file', 'Tổng hợp'], 1) } as any)
  const b = await band($)
  expect(b.meta).toContain('main steps')
})

test('thu gọn, đóng, mở lại bằng /progress và tự mở khi có task mới', { options: { language: 'vi' } }, async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: plan(['A', 'B', 'C', 'D'], 1) } as any)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as any)
    await ui.press({ key: 'minimize' })
    expect(await ui.find({ key: 'expand' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /bước lớn/ })).toBeUndefined()
    await ui.press({ key: 'expand' })
    expect(await ui.find({ type: 'Text', text: /bước lớn/ })).toBeDefined()
    await ui.unmount()
  }

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  await ui.press({ key: 'close' })
  expect(await ui.find({ type: 'Text', text: /%$/ })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'progress', args: '' } as any)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await ui.find({ type: 'Text', text: /%$/ }))?.text).toBe('28%')
  await ui.press({ key: 'close' })
  await ui.unmount()

  // Task mới (list cũ được dọn) → thanh tự mở lại.
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: '' } as any)
  await $.prompt.submit({ text: 'việc mới' } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: plan(['X', 'Y'], 0) } as any)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await ui.find({ type: 'Text', text: /%$/ }))?.text).toBe('5%')
  await ui.unmount()
})


test('task xong vẫn hiện 100% qua prompt mới, tới khi có task mới', { options: { language: 'vi' } }, async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: plan(['A', 'B'], 1) } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: '' } as any)
  await $.turn.complete(turnEnd(false))
  await $.prompt.submit({ text: 'câu hỏi khác' } as any)
  await $.turn.complete(turnEnd(false))
  expect((await band($)).pct).toBe('100%')

  // TaskCreate sau task đã xong: list mới, không cộng dồn vào list cũ.
  await $.tool.call({ tool: 'TaskCreate', subject: 'X', description: 'x' } as any)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Y', description: 'y' } as any)
  const b = await band($)
  expect(b.pct).toBe('0%')
  expect(b.meta).toContain('0/2')
})

test('mod nạp sau khi task đã chạy: dựng lại từ lịch sử session', { options: { language: 'vi' } }, async ($, on) => {
  const use = (tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    tool_use_id: `${tool}-${Math.random()}`, tool, input, ...extra,
  })
  const items = Array.from({ length: 12 }, (_, i) => ({ content: `Việc ${i + 1}`, status: i === 0 ? 'in_progress' : 'pending' }))
  const history = [
    { role: 'user', text: 'sửa lỗi kiểm thử lần 7', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [use('mcp__ccd_turn__update_plan', { items, scope: 'first_task' })] },
    ...Array.from({ length: 11 }, () => ({ role: 'assistant', text: '', toolUses: [use('mcp__ccd_turn__update_plan', { advance: true }), use('Bash', { command: 'make test' })] })),
    { role: 'assistant', text: '', toolUses: [use('TaskCreate', { subject: 'bỏ qua', description: '' }, { isError: true, text: 'lỗi' })] },
  ]
  on('session.messages', () => ({ value: history }) as any)
  await setup($, on)
  const b = await band($)
  expect(b.pct).toBe('93%') // 11/12 + nấc bắt đầu việc 12 = 92.5 → 93
  expect(b.meta).toContain('11/12')
})

test('dựng lại TaskCreate/TaskUpdate khi lịch sử chỉ lưu chữ', async () => {
  const p = replay([
    { toolUses: [{ tool: 'TaskCreate', input: { subject: 'A' }, text: 'Task #1 created successfully: A' }] },
    { toolUses: [{ tool: 'TaskCreate', input: { subject: 'B' }, text: 'Task #2 created successfully: B' }] },
    { toolUses: [{ tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }] },
    { toolUses: [{ tool: 'TaskUpdate', input: { taskId: '2', status: 'in_progress' } }] },
  ])
  expect(summarize(p).total).toBe(2)
  expect(summarize(p).percent).toBe(55)
})
