import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Progress, Step, StepStatus, View } from '../types'
import { pickLang, STRINGS } from './i18n'

const EMPTY: Progress = { steps: [], subs: {} }
const progress = atom({ plugin: 'task-progress', key: 'progress' } as const, EMPTY)

const view = atom({ plugin: 'task-progress', key: 'view' } as const, 'full' as View)
const COMMAND = 'progress'

const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
/** Desktop app: kết thúc lượt cũng tự đánh dấu xong mọi bước còn lại của plan. */
const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'

const allDone = (steps: Step[]): Step[] => steps.map(s => ({ ...s, status: 'completed' as const }))

/** Đánh dấu xong cả list chính lẫn list của các subagent. */
export const finish = (p: Progress): Progress => ({
  steps: allDone(p.steps),
  subs: Object.fromEntries(Object.entries(p.subs).map(([k, v]) => [k, { ...v, steps: allDone(v.steps) }])),
})
const MAIN = '' // key của luồng chính

const asStatus = (s: unknown): StepStatus =>
  s === 'completed' || s === 'in_progress' ? s : 'pending'

// ---------- Cây & phần trăm ----------

/**
 * List phẳng → cây theo thụt lề: dòng bắt đầu bằng khoảng trắng, "-", "↳" hoặc
 * đánh số "2.1" là bước con của bước lớn ngay trước nó.
 */
const CHILD = /^(\s+|[-*↳]\s+|\d+\.\d+[.)]?\s+)/
export const nest = (flat: Step[]): Step[] => {
  const out: Step[] = []
  for (const s of flat) {
    const parent = out[out.length - 1]
    if (parent && CHILD.test(s.title)) {
      parent.children = [...(parent.children ?? []), { ...s, title: s.title.replace(CHILD, '') }]
    } else out.push({ ...s, title: s.title.trim() })
  }
  // Trạng thái của bước lớn có bước con suy ra từ các con: list phẳng có thể đánh
  // dấu bước cha xong trước khi các con của nó chạy.
  return out.map(s => {
    const kids = s.children
    if (!kids?.length) return s
    const status: StepStatus = kids.every(c => c.status === 'completed')
      ? 'completed'
      : s.status !== 'pending' || kids.some(c => c.status !== 'pending')
        ? 'in_progress'
        : 'pending'
    return { ...s, status }
  })
}

/** Gắn list của các subagent vào bước cha của chúng (đệ quy). */
const attach = (steps: Step[], p: Progress): Step[] =>
  steps.map(s => {
    const subs = Object.values(p.subs)
      .filter(x => x.parent === s.id)
      .flatMap(x => x.steps)
    const own = s.children ? attach(s.children, p) : []
    const children = [...own, ...attach(subs, p)]
    return children.length ? { ...s, children } : s
  })

export const tree = (p: Progress): Step[] => attach(nest(p.steps), p)

/** Nấc nhỏ khi một bước vừa bắt đầu: 10% phần của chính bước đó. */
export const START = 0.1

/**
 * Phần đã xong của một bước, 0..1: xong = 1; có bước con = trung bình các con
 * (bước cha đã bắt đầu mà con chưa chạy thì tính như con đầu tiên vừa bắt đầu,
 * để % không tụt khi con đầu tiên bắt đầu); đang làm = START; chưa làm = 0.
 */
export const fraction = (s: Step): number => {
  if (s.status === 'completed') return 1
  const kids = s.children
  if (kids?.length) {
    const avg = kids.reduce((a, c) => a + fraction(c), 0) / kids.length
    return s.status === 'in_progress' ? Math.max(avg, START / kids.length) : avg
  }
  return s.status === 'in_progress' ? START : 0
}

export const summarize = (p: Progress) => {
  const steps = tree(p)
  const total = steps.length
  const done = steps.filter(s => s.status === 'completed').length
  const value = total === 0 ? 0 : steps.reduce((a, s) => a + fraction(s), 0) / total
  // Làm tròn số nguyên; chỉ hiện 100% khi xong hết thật, 0% chỉ khi chưa xong gì.
  const raw = Math.round(value * 100)
  const percent = value >= 1 ? 100 : value > 0 ? Math.min(99, Math.max(1, raw)) : 0
  // Đường đang chạy: bước lớn → bước con → ...
  const path: string[] = []
  let level: Step[] | undefined = steps
  while (level?.length) {
    const cur: Step | undefined = level.find(s => s.status === 'in_progress')
    if (!cur) break
    path.push(cur.title)
    level = cur.children
  }
  return { steps, total, done, percent, path }
}

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))

const BAR_WIDTH = 20
const filledCells = (percent: number) => Math.round((percent / 100) * BAR_WIDTH)

/** Chữ hiển thị cho tiến độ hiện tại, theo ngôn ngữ đã chọn. */
let langOption: unknown = 'auto'
let locale: string | undefined

const allTitles = (p: Progress) =>
  [...p.steps, ...Object.values(p.subs).flatMap(x => x.steps)].map(s => s.title).join(' ')

export const t = (p: Progress) => STRINGS[pickLang(langOption, allTitles(p), locale)]

const label = (p: Progress) => {
  const { total, done, percent, path } = summarize(p)
  if (total === 0) return undefined
  if (p.stopped) return t(p).stoppedAt(percent, done, total)
  return `${fmt(percent)}% (${done}/${total})${path.length ? ` · ${path.join(' › ')}` : ''}`
}

// ---------- Cập nhật list ----------

/** Áp một lần gọi update_plan của desktop app (items / advance / done / start). */
export const applyPlan = (steps: Step[], args: Record<string, unknown>, prefix: string): Step[] => {
  if (Array.isArray(args.items)) {
    return args.items.map((it: any, i: number) => ({
      id: `${prefix}plan-${i}`,
      title: String(it?.content ?? `Bước ${i + 1}`),
      status: asStatus(it?.status),
    }))
  }
  let next = steps.map(s => ({ ...s }))
  if (args.advance === true) {
    const cur = next.findIndex(s => s.status === 'in_progress')
    if (cur >= 0) next[cur]!.status = 'completed'
    const pend = next.findIndex((s, i) => i > cur && s.status === 'pending')
    if (pend >= 0) next[pend]!.status = 'in_progress'
  }
  if (Array.isArray(args.done)) {
    for (const n of args.done) if (typeof n === 'number' && next[n - 1]) next[n - 1]!.status = 'completed'
  }
  if (typeof args.start === 'number' && next[args.start - 1]) {
    next = next.map(s => (s.status === 'in_progress' ? { ...s, status: 'pending' as const } : s))
    next[args.start - 1]!.status = 'in_progress'
  }
  return next
}

/** Bước sâu nhất đang chạy của luồng chính: nơi list của subagent mới được gắn vào. */
const activeLeafId = (p: Progress): string | null => {
  let level = tree(p)
  let id: string | null = null
  while (level.length) {
    const cur = level.find(s => s.status === 'in_progress')
    if (!cur) break
    id = cur.id
    level = cur.children ?? []
  }
  return id
}

const listOf = (p: Progress, agent: string) => (agent === MAIN ? p.steps : p.subs[agent]?.steps ?? [])

const withList = (p: Progress, agent: string, steps: Step[]): Progress => {
  if (agent === MAIN) return { ...p, steps }
  const parent = p.subs[agent]?.parent ?? activeLeafId(p)
  return { ...p, subs: { ...p.subs, [agent]: { parent, steps } } }
}

/** Lượt hiện tại đã đổi task list chưa. */
let touched = false

async function set($: EngineInterface, fn: (p: Progress) => Progress) {
  const before = summarize({ ...EMPTY, ...(await read($, progress)) })
  touched = true
  await update($, progress, p => ({ ...fn({ ...EMPTY, ...p }), stopped: false }))
  const after = await read($, progress)
  const s = summarize(after)
  $.ui.status(label(after))
  const isNewTask = (before.total === 0 || before.percent >= 100) && s.total > 0 && s.percent < 100
  if (isNewTask) await update($, view, () => 'full' as View)
  if (s.total > 0 && s.percent >= 100 && before.percent < 100) {
    $.ui.toast(t(after).doneToast(s.total))
  }
}

// ---------- Hooks ----------

export const register: Register = (on, options) => {
  langOption = options.language ?? 'auto'

  on('session.start', async ($, e, next) => {
    locale = (await $.env.get('LC_ALL')) || (await $.env.get('LANG')) || undefined
    const p = { ...EMPTY, ...(await read($, progress)) }
    await $.command.register({ name: COMMAND, description: t(p).command })
    $.ui.status(label({ ...EMPTY, ...(await read($, progress)) }))
    return next(e)
  })

  // Prompt mới: task cũ đã xong hết thì dọn để tính lại từ đầu.
  on('prompt.submit', async ($, e, next) => {
    // Task đã xong vẫn hiện (100%) tới khi có task list mới thay vào.
    touched = false
    return next(e)
  }).catch(($, e, next) => next(e))

  // /progress: mở lại thanh (hoặc mở rộng nếu đang thu gọn).
  on('command.run', { command: COMMAND }, async $ => {
    await update($, view, () => 'full' as View)
    // Chỉ để người dùng đọc: không đưa vào request nào, không tốn token.
    const p = { ...EMPTY, ...(await read($, progress)) }
    const tr = t(p)
    return { text: summarize(p).total > 0 ? tr.reopened : tr.empty, isTextDisplayOnly: true }
  })

  // Cancel: giữ % hiện tại nhưng ghi "đã dừng". Lượt sau, nếu Claude lập lại /
  // thêm bước thì % tự tính lại theo list mới; nếu lượt sau không đụng tới list
  // cũ đã dừng thì dọn nó đi để không treo số cũ.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const p = { ...EMPTY, ...(await read($, progress)) }
      const s = summarize(p)
      if (e.isAborted && s.total > 0 && s.percent < 100) {
        await update($, progress, q => ({ ...EMPTY, ...q, stopped: true }))
        $.ui.status(label({ ...p, stopped: true }))
      } else if (!e.isAborted && p.stopped && !touched) {
        await set($, () => EMPTY)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const agent = e.agentId ?? MAIN
    const pre = agent === MAIN ? '' : `${agent}:`

    if (e.tool === 'TodoWrite') {
      const steps = e.todos.map((t, i) => ({ id: `${pre}todo-${i}`, title: t.content, status: t.status }))
      await set($, p => withList(p, agent, steps))
    } else if (e.tool === 'TaskCreate') {
      const r = ran.result as { task?: { id?: string } } | undefined
      const id = `${pre}${r?.task?.id ?? Date.now()}`
      const title = e.subject
      await set($, p => {
        const base = agent === MAIN && summarize(p).percent >= 100 ? EMPTY : p
        return withList(base, agent, [...listOf(base, agent), { id, title, status: 'pending' }])
      })
    } else if (e.tool === 'TaskUpdate') {
      const { status, subject } = e
      const id = `${pre}${e.taskId}`
      await set($, p => {
        const list = listOf(p, agent)
        const steps =
          status === 'deleted'
            ? list.filter(s => s.id !== id)
            : list.map(s =>
                s.id === id ? { ...s, title: subject ?? s.title, status: status ? asStatus(status) : s.status } : s,
              )
        return withList(p, agent, steps)
      })
    } else if (e.tool === WRAP_TOOL && agent === MAIN) {
      await set($, finish)
    } else if (e.tool === PLAN_TOOL) {
      const args = e as unknown as Record<string, unknown>
      await set($, p => withList(p, agent, applyPlan(listOf(p, agent), args, pre)))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = { ...EMPTY, ...(await read($, progress)) }
    const mode = await read($, view)
    const { steps, total, done, percent, path } = summarize(p)
    if (e.props.hasSurvey || total === 0 || mode === 'closed') return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const tr = t(p)
    const color = percent >= 100 ? 'green' : p.stopped ? 'yellow' : 'cyan'
    const setView = (v: View) => () => update($, view, () => v)
    const close = async () => {
      await update($, view, () => 'closed' as View)
      $.ui.toast(tr.closed)
    }

    // Nút chỉ có icon trên mọi giao diện.
    const closeButton = <Button key="close" plain dimColor label="✕" onPress={close} />

    if (mode === 'mini') {
      const width = 8
      const filled = Math.round((percent / 100) * width)
      return (
        <Box>
          <Text color={color}>{'━'.repeat(filled)}</Text>
          <Text dimColor>{'━'.repeat(width - filled)} </Text>
          <Text bold>{fmt(percent)}%</Text>
          <Text dimColor>{p.stopped ? ` ⏸ ${tr.stopped}` : ''} </Text>
          <Button key="expand" plain dimColor label="□" onPress={setView('full')} />
          {closeButton}
        </Box>
      )
    }

    const cur = steps.find(s => s.status === 'in_progress')
    const sub = cur?.children?.length
      ? tr.thisStep(Math.round(fraction(cur) * 100), cur.children.filter(c => c.status === 'completed').length, cur.children.length)
      : ''

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={color}>{'━'.repeat(filledCells(percent))}</Text>
          <Text dimColor>{'━'.repeat(BAR_WIDTH - filledCells(percent))} </Text>
          <Text bold>{fmt(percent)}%</Text>
          <Text dimColor> {tr.bigSteps(done, total)}{p.stopped ? ` · ⏸ ${tr.stopped}` : ''} </Text>
          <Button key="minimize" plain dimColor label="−" onPress={setView('mini')} />
          {closeButton}
        </Box>
        {path.length && !p.stopped ? (
          <Text dimColor>
            {tr.doing} {path.join(' › ')}
            {sub ? ` (${sub})` : ''}
          </Text>
        ) : null}
      </Box>
    )
  })
}
