/** Cách hiện thanh: đầy đủ, thu gọn một dòng, hay đóng (mở lại bằng /progress). */
export type View = 'full' | 'mini' | 'closed'
export type StepStatus = 'pending' | 'in_progress' | 'completed'
/** Một bước; `children` chia nhỏ phần trăm của chính bước này. */
export type Step = { id: string; title: string; status: StepStatus; children?: Step[] }
/** `steps`: list của luồng chính. `subs`: list của từng subagent, gắn vào bước `parent`. */
export type Progress = {
  steps: Step[]
  subs: Record<string, { parent: string | null; steps: Step[] }>
  /** Lượt bị huỷ (cancel) trước khi xong: thanh hiện "đã dừng" tới khi list đổi. */
  stopped?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'task-progress': { progress: Progress; view: View }
  }
}
