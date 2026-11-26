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
/** Trong một bước đang làm, mỗi lần Claude gọi lệnh thì nhích thêm, chậm dần, không quá CAP của bước. */
export const CAP = 0.8
const DECAY = 0.95
export const started = (work = 0) => START + (CAP - START) * (1 - DECAY ** Math.max(0, work))

/**
 * Phần đã xong của một bước, 0..1: xong = 1; có bước con = trung bình các con
 * (bước cha đã bắt đầu mà con chưa chạy thì tính như con đầu tiên vừa bắt đầu,
 * để % không tụt khi con đầu tiên bắt đầu); đang làm = START; chưa làm = 0.
 */
export const fraction = (s: Step, work = 0): number => {
  if (s.status === 'completed') return 1
  const kids = s.children
  if (kids?.length) {
    const avg = kids.reduce((a, c) => a + fraction(c, work), 0) / kids.length
    return s.status === 'in_progress' ? Math.max(avg, START / kids.length) : avg
  }
  return s.status === 'in_progress' ? started(work) : 0
}

export const summarize = (p: Progress) => {
  const steps = tree(p)
  const total = steps.length
  const done = steps.filter(s => s.status === 'completed').length
  const value = total === 0 ? 0 : steps.reduce((a, s) => a + fraction(s, p.work ?? 0), 0) / total
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

// ---------- Thanh động (desktop / VS Code / mobile) ----------

const HEX = { cyan: '#37b8d6', green: '#3fb950', yellow: '#d29922' } as const
/** % đã vẽ lần trước, để thanh trượt từ đó tới % mới. */
let shownPercent = 0

/**
 * Thanh SVG: phần đầy trượt mượt từ `from` tới `to`; lúc Claude đang làm thì có
 * vệt sáng chạy ngang phần đầy. Vẽ trên máy, không tốn token.
 */
export const svgBar = (from: number, to: number, color: string, isMoving: boolean, w: number, h = 6): string => {
  const fw = (n: number) => ((Math.max(0, Math.min(100, n)) / 100) * w).toFixed(1)
  const grow = from === to ? '' : `<animate attributeName="width" from="${fw(from)}" to="${fw(to)}" dur="0.6s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>`
  const shine = isMoving
    ? `<rect y="0" width="${w / 4}" height="${h}" fill="url(#s)" clip-path="url(#c)"><animate attributeName="x" from="${-w / 4}" to="${w}" dur="1.6s" repeatCount="indefinite"/></rect>`
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="c"><rect width="${fw(to)}" height="${h}" rx="${h / 2}">${grow}</rect></clipPath></defs>` +
    `<rect width="${w}" height="${h}" rx="${h / 2}" fill="#8888884d"/>` +
    `<rect width="${fw(to)}" height="${h}" rx="${h / 2}" fill="${color}">${grow}</rect>` +
    shine +
    `</svg>`
  )
}

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))

const BAR_WIDTH = 20

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

// ---------- Một lần gọi tool → tiến độ mới (dùng cho cả lúc chạy lẫn lúc dựng lại lịch sử) ----------

export type Call = { tool: string; input: Record<string, unknown>; result?: unknown; agent: string; text?: string }

export const TRACKED = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', PLAN_TOOL, WRAP_TOOL])

export const applyCall = (p: Progress, c: Call): Progress => {
  const { tool, input, agent } = c
  const pre = agent === MAIN ? '' : `${agent}:`
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    const steps = input.todos.map((t: any, i: number) => ({ id: `${pre}todo-${i}`, title: String(t?.content ?? ''), status: asStatus(t?.status) }))
    return withList(p, agent, steps)
  }
  if (tool === 'TaskCreate') {
    const r = c.result as { task?: { id?: string } } | undefined
    // Lịch sử có thể không lưu bản ghi kết quả: lấy số task từ chữ "Task #3 created".
    const fromText = c.text?.match(/#(\d+)/)?.[1]
    const id = `${pre}${r?.task?.id ?? fromText ?? Date.now()}`
    const base = agent === MAIN && summarize(p).percent >= 100 ? EMPTY : p
    return withList(base, agent, [...listOf(base, agent), { id, title: String(input.subject ?? ''), status: 'pending' }])
  }
  if (tool === 'TaskUpdate') {
    const id = `${pre}${String(input.taskId)}`
    const status = input.status as string | undefined
    const subject = input.subject as string | undefined
    const list = listOf(p, agent)
    const steps =
      status === 'deleted'
        ? list.filter(s => s.id !== id)
        : list.map(s => (s.id === id ? { ...s, title: subject ?? s.title, status: status ? asStatus(status) : s.status } : s))
    return withList(p, agent, steps)
  }
  if (tool === WRAP_TOOL && agent === MAIN) return finish(p)
  if (tool === PLAN_TOOL) return withList(p, agent, applyPlan(listOf(p, agent), input, pre))
  return p
}

/** Dựng lại tiến độ từ lịch sử của luồng chính (session mở lại, hoặc mod cài sau khi task đã chạy). */
/** Đổi bước đang làm thì đếm lại từ đầu; còn cùng bước thì giữ phần đã nhích. */
export const keepWork = (before: Progress, after: Progress): Progress => ({
  ...after,
  work: activeLeafId(after) === activeLeafId(before) ? before.work ?? 0 : 0,
})
/** Một lần gọi lệnh trong lúc đang có bước chạy dở. */
export const working = (p: Progress): Progress => {
  const s = summarize(p)
  return s.total > 0 && s.percent < 100 && !p.stopped ? { ...p, work: (p.work ?? 0) + 1 } : p
}

export const replay = (messages: readonly { toolUses?: readonly { tool: string; input: Record<string, unknown>; result?: unknown; text?: string; isError?: boolean }[] }[]): Progress => {
  let p: Progress = EMPTY
  for (const m of messages) {
    for (const u of m.toolUses ?? []) {
      if (u.isError) continue
      p = TRACKED.has(u.tool)
        ? keepWork(p, applyCall(p, { tool: u.tool, input: u.input, result: u.result, text: u.text, agent: MAIN }))
        : working(p)
    }
  }
  return p
}

/** Lượt hiện tại đã đổi task list chưa. */
let touched = false

const OURS = /^task-progress(@.*)?$/i
/** Bỏ các hàng trùng của mod này, giữ hàng đầu tiên và mọi hàng của plugin khác. */
export function dedupeRows<R extends { plugin: string }>(rows: readonly R[]): R[] {
  let seen = false
  return rows.filter(r => {
    if (!OURS.test(r.plugin)) return true
    if (seen) return false
    seen = true
    return true
  })
}

async function set($: EngineInterface, fn: (p: Progress) => Progress) {
  const before = summarize({ ...EMPTY, ...(await read($, progress)) })
  touched = true
  await update($, progress, p => {
    const cur = { ...EMPTY, ...p }
    return { ...keepWork(cur, fn(cur)), stopped: false }
  })
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
    try {
      locale = (await $.env.get('LC_ALL')) || (await $.env.get('LANG')) || undefined
    } catch {
      locale = undefined
    }
    // Chưa biết task nào (mod vừa cài / session mở lại): dựng lại từ lịch sử.
    if (summarize({ ...EMPTY, ...(await read($, progress)) }).total === 0) {
      try {
        const history = await $.session.messages({})
        const rebuilt = Array.isArray(history) ? replay(history) : EMPTY
        if (summarize(rebuilt).total > 0) await update($, progress, () => rebuilt)
      } catch {
        // Không đọc được lịch sử: bắt đầu trống như trước.
      }
    }
    const p = { ...EMPTY, ...(await read($, progress)) }
    try {
      await $.command.register({ name: COMMAND, description: t(p).command })
    } catch {
      // Bản khác của mod (cài từ GitHub / tổ chức) đã đăng ký /progress: dùng chung lệnh đó.
    }
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
    const call: Call = { tool: e.tool, input: e as unknown as Record<string, unknown>, result: ran.result, agent: e.agentId ?? MAIN }
    if (TRACKED.has(call.tool)) await set($, p => applyCall(p, call))
    else {
      // Claude đang làm mà chưa đánh dấu bước: nhích dần trong bước hiện tại.
      const before = { ...EMPTY, ...(await read($, progress)) }
      const after = working(before)
      if (after !== before) {
        await update($, progress, p => working({ ...EMPTY, ...p }))
        $.ui.status(label(after))
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Hai bản của mod cùng nạp (bản cài + bản dev, hay bản tổ chức + bản GitHub)
  // thì mỗi bản vẽ một hàng: chỉ giữ hàng đầu tiên của Task-Progress.
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) =>
    next({ ...e, props: { ...e.props, rows: dedupeRows(e.props.rows) } }),
  ).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = { ...EMPTY, ...(await read($, progress)) }
    const mode = await read($, view)
    const { steps, total, done, percent, path } = summarize(p)
    if (e.props.hasSurvey || total === 0 || mode === 'closed') return next(e)

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const tr = t(p)
    const color = percent >= 100 ? 'green' : p.stopped ? 'yellow' : 'cyan'
    // Ngoài terminal: thanh SVG động; terminal giữ thanh chữ.
    const isTextBar = e.surface === 'terminal' || Svg === undefined
    const from = shownPercent
    shownPercent = percent
    const isMoving = e.props.isWorking === true && percent < 100 && !p.stopped
    const bar = (w: number, cells: number) =>
      isTextBar || !Svg ? (
        <Box>
          <Text color={color}>{'━'.repeat(Math.round((percent / 100) * cells))}</Text>
          <Text dimColor>{'━'.repeat(cells - Math.round((percent / 100) * cells))} </Text>
        </Box>
      ) : (
        <Box marginRight={1}>
          <Svg source={svgBar(from, percent, HEX[color], isMoving, w)} alt={`${fmt(percent)}%`} width={w} height={6} />
        </Box>
      )
    const setView = (v: View) => () => update($, view, () => v)
    const close = async () => {
      await update($, view, () => 'closed' as View)
      $.ui.toast(tr.closed)
    }

    // Nút chỉ có icon trên mọi giao diện.
    const closeButton = <Button key="close" plain dimColor label="✕" onPress={close} />

    if (mode === 'mini') {
      const width = 8
      return (
        <Box justifyContent="space-between" width="100%">
          <Box alignItems="center">
            {bar(64, width)}
            <Text bold>{fmt(percent)}%</Text>
            <Text dimColor>{p.stopped ? ` ⏸ ${tr.stopped}` : ''}</Text>
          </Box>
          <Box gap={1}>
            <Button key="expand" plain dimColor label="□" onPress={setView('full')} />
            {closeButton}
          </Box>
        </Box>
      )
    }

    const cur = steps.find(s => s.status === 'in_progress')
    const sub = cur?.children?.length
      ? tr.thisStep(Math.round(fraction(cur) * 100), cur.children.filter(c => c.status === 'completed').length, cur.children.length)
      : ''

    return (
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between" width="100%">
          <Box alignItems="center">
            {bar(180, BAR_WIDTH)}
            <Text bold>{fmt(percent)}%</Text>
            <Text dimColor> {tr.bigSteps(done, total)}{p.stopped ? ` · ⏸ ${tr.stopped}` : ''}</Text>
          </Box>
          <Box gap={1}>
            <Button key="minimize" plain dimColor label="−" onPress={setView('mini')} />
            {closeButton}
          </Box>
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
