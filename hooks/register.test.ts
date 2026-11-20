import { expect, test } from 'claude-code/testing'

import { dedupeRows, summarize } from './register'
import type { Progress } from '../types'
import { pickLang } from './i18n'

const plan = (statuses: string[]) => statuses.map((st, i) => ({ id: `p${i}`, title: `Việc ${i + 1}`, status: st as any }))

test('5 việc, việc 2 có 3 việc nhỏ (subagent) chia nhỏ 20% của nó', async () => {
  const p: Progress = {
    steps: plan(['completed', 'in_progress', 'pending', 'pending', 'pending']),
    subs: { a1: { parent: 'p1', steps: [] } },
  }
  const withSub = (st: string[]): Progress => ({
    ...p,
    subs: { a1: { parent: 'p1', steps: st.map((x, i) => ({ id: `a1:${i}`, title: `nhỏ ${i + 1}`, status: x as any })) } },
  })
  expect(summarize({ steps: p.steps, subs: {} }).percent).toBe(22) // 20 + nấc bắt đầu 2
  expect(summarize(withSub(['completed', 'in_progress', 'pending'])).percent).toBe(27)
  expect(summarize(withSub(['completed', 'completed', 'in_progress'])).percent).toBe(34)
  expect(summarize(withSub(['completed', 'completed', 'completed'])).percent).toBe(40)
  expect(summarize(withSub(['completed', 'in_progress', 'pending'])).path).toEqual(['Việc 2', 'nhỏ 2'])
})

test('bước thụt lề / đánh số 2.1 là bước con', async () => {
  const p: Progress = {
    steps: [
      { id: 'a', title: 'Việc 1', status: 'completed' },
      { id: 'b', title: 'Việc 2', status: 'in_progress' },
      { id: 'c', title: '2.1 nhỏ', status: 'completed' },
      { id: 'd', title: '2.2 nhỏ', status: 'pending' },
      { id: 'e', title: 'Việc 3', status: 'pending' },
      { id: 'f', title: 'Việc 4', status: 'pending' },
    ],
    subs: {},
  }
  const s = summarize(p)
  expect(s.total).toBe(4)
  expect(s.percent).toBe(38) // 25 + 25*(1/2) = 37.5
})

test('chỉ 100% khi xong hết', async () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ id: `${i}`, title: `v${i}`, status: (i < 299 ? 'completed' : 'pending') as any }))
  expect(summarize({ steps: many, subs: {} }).percent).toBe(99)
})

test('advance phẳng không làm bước cha xong trước các con', async () => {
  const st = (x: string[]) => ({
    steps: ['Việc 1', 'Việc 2', '2.1 a', '2.2 b', '2.3 c', 'Việc 3', 'Việc 4'].map((t, i) => ({ id: `${i}`, title: t, status: x[i] as any })),
    subs: {},
  })
  const P = 'pending', D = 'completed', R = 'in_progress'
  expect(summarize(st([D, D, R, P, P, P, P])).percent).toBe(26)
  expect(summarize(st([D, D, D, R, P, P, P])).percent).toBe(34)
  expect(summarize(st([D, D, D, D, R, P, P])).percent).toBe(43) // 25 + 25*2.1/3 = 42.5
  expect(summarize(st([D, D, D, D, R, P, P])).path).toEqual(['Việc 2', 'c'])
  expect(summarize(st([D, D, D, D, D, R, P])).percent).toBe(53)
})


test('vừa bắt đầu là nhích lên, không bao giờ tụt khi vào bước con', async () => {
  const P = 'pending', D = 'completed', R = 'in_progress'
  const st = (x: string[]) => ({
    steps: ['A', 'B', '- b1', '- b2', 'C', 'D'].map((t, i) => ({ id: `${i}`, title: t, status: x[i] as any })),
    subs: {},
  })
  const seq = [
    [P, P, P, P, P, P],
    [R, P, P, P, P, P],
    [D, R, P, P, P, P],
    [D, D, R, P, P, P], // advance phẳng: cha "xong", con đầu bắt đầu
    [D, D, D, R, P, P],
    [D, D, D, D, R, P],
    [D, D, D, D, D, R],
    [D, D, D, D, D, D],
  ].map(x => summarize(st(x)).percent)
  expect(seq[0]).toBe(0)
  expect(seq[1]).toBe(3) // 4 việc, việc 1 vừa bắt đầu
  for (let i = 1; i < seq.length; i++) expect(seq[i]! >= seq[i - 1]!).toBe(true)
  expect(seq[seq.length - 1]).toBe(100)
})

test('ngôn ngữ: tuỳ chọn → chữ trong bước → LANG → en', async () => {
  expect(pickLang('ja', 'Đếm file', 'vi_VN.UTF-8')).toBe('ja')
  expect(pickLang('auto', 'Đếm file .html', 'en_US.UTF-8')).toBe('vi')
  expect(pickLang('auto', 'ファイルを数える', undefined)).toBe('ja')
  expect(pickLang('auto', '파일 세기', undefined)).toBe('ko')
  expect(pickLang('auto', '统计文件', undefined)).toBe('zh')
  expect(pickLang('auto', 'Count files', 'fr_FR.UTF-8')).toBe('fr')
  expect(pickLang('auto', 'Count files', undefined)).toBe('en')
})

test('duplicate rows of this mod collapse to one', () => {
  const rows = [
    { plugin: 'other', tree: 1 },
    { plugin: 'task-progress', tree: 2 },
    { plugin: 'task-progress@yuhtahn', tree: 3 },
    { plugin: 'task-progress', tree: 4 },
  ]
  expect(dedupeRows(rows).map(r => r.tree)).toEqual([1, 2])
})
