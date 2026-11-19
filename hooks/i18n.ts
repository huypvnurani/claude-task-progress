/** Chữ hiển thị của mod, theo từng ngôn ngữ. */
export type Lang = 'en' | 'vi' | 'zh' | 'ja' | 'ko' | 'th' | 'fr' | 'es' | 'de' | 'pt' | 'id'
export const LANGS: readonly Lang[] = ['en', 'vi', 'zh', 'ja', 'ko', 'th', 'fr', 'es', 'de', 'pt', 'id']

type Strings = {
  /** "(1/4 bước lớn)" */
  bigSteps: (done: number, total: number) => string
  stopped: string
  doing: string
  /** "bước này 33% · 1/3 bước con" */
  thisStep: (pct: number, done: number, total: number) => string
  doneToast: (total: number) => string
  stoppedAt: (pct: number, done: number, total: number) => string
  minimize: string
  expand: string
  close: string
  /** Lời nhắc khi đóng thanh, chỉ cách mở lại. */
  closed: string
  /** Lệnh /progress */
  command: string
  reopened: string
  /** /progress khi chưa có task list nào. */
  empty: string
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    bigSteps: (d, t) => `(${d}/${t} main steps)`,
    stopped: 'Stopped',
    doing: 'Now:',
    thisStep: (p, d, t) => `this step ${p}% · ${d}/${t} sub-steps`,
    doneToast: t => `✅ 100% done (${t}/${t} steps)`,
    stoppedAt: (p, d, t) => `⏸ Stopped at ${p}% (${d}/${t})`,
    minimize: 'Minimize',
    expand: 'Expand',
    close: 'Close',
    closed: 'Progress bar closed. Type /progress to show it again.',
    command: 'Show the task progress bar',
    reopened: 'Progress bar shown.',
    empty: 'No task list yet. The bar appears as soon as Claude plans a task.',
  },
  vi: {
    bigSteps: (d, t) => `(${d}/${t} bước lớn)`,
    stopped: 'Đã dừng',
    doing: 'Đang làm:',
    thisStep: (p, d, t) => `bước này ${p}% · ${d}/${t} bước con`,
    doneToast: t => `✅ Xong 100% (${t}/${t} bước)`,
    stoppedAt: (p, d, t) => `⏸ Đã dừng ở ${p}% (${d}/${t})`,
    minimize: 'Thu gọn',
    expand: 'Mở rộng',
    close: 'Đóng',
    closed: 'Đã đóng thanh tiến độ. Gõ /progress để mở lại.',
    command: 'Hiện thanh tiến độ của task',
    reopened: 'Đã mở thanh tiến độ.',
    empty: 'Chưa có task nào. Thanh sẽ hiện ngay khi Claude lập danh sách bước.',
  },
  zh: {
    bigSteps: (d, t) => `（${d}/${t} 个主要步骤）`,
    stopped: '已停止',
    doing: '进行中：',
    thisStep: (p, d, t) => `本步骤 ${p}% · ${d}/${t} 个子步骤`,
    doneToast: t => `✅ 已完成 100%（${t}/${t} 步）`,
    stoppedAt: (p, d, t) => `⏸ 停在 ${p}%（${d}/${t}）`,
    minimize: '最小化',
    expand: '展开',
    close: '关闭',
    closed: '进度条已关闭。输入 /progress 重新显示。',
    command: '显示任务进度条',
    reopened: '进度条已显示。',
    empty: '还没有任务列表。Claude 规划任务后进度条会立即出现。',
  },
  ja: {
    bigSteps: (d, t) => `（主要ステップ ${d}/${t}）`,
    stopped: '停止',
    doing: '作業中：',
    thisStep: (p, d, t) => `このステップ ${p}% · サブステップ ${d}/${t}`,
    doneToast: t => `✅ 100% 完了（${t}/${t} ステップ）`,
    stoppedAt: (p, d, t) => `⏸ ${p}% で停止（${d}/${t}）`,
    minimize: '最小化',
    expand: '展開',
    close: '閉じる',
    closed: '進捗バーを閉じました。/progress で再表示できます。',
    command: 'タスクの進捗バーを表示',
    reopened: '進捗バーを表示しました。',
    empty: 'タスクリストはまだありません。Claude がタスクを計画するとバーが表示されます。',
  },
  ko: {
    bigSteps: (d, t) => `(주요 단계 ${d}/${t})`,
    stopped: '중지됨',
    doing: '진행 중:',
    thisStep: (p, d, t) => `이 단계 ${p}% · 하위 단계 ${d}/${t}`,
    doneToast: t => `✅ 100% 완료 (${t}/${t} 단계)`,
    stoppedAt: (p, d, t) => `⏸ ${p}%에서 중지 (${d}/${t})`,
    minimize: '최소화',
    expand: '펼치기',
    close: '닫기',
    closed: '진행 표시줄을 닫았습니다. /progress 를 입력하면 다시 표시됩니다.',
    command: '작업 진행 표시줄 표시',
    reopened: '진행 표시줄을 표시했습니다.',
    empty: '아직 작업 목록이 없습니다. Claude가 작업을 계획하면 바로 표시됩니다.',
  },
  th: {
    bigSteps: (d, t) => `(ขั้นตอนหลัก ${d}/${t})`,
    stopped: 'หยุดแล้ว',
    doing: 'กำลังทำ:',
    thisStep: (p, d, t) => `ขั้นตอนนี้ ${p}% · ขั้นตอนย่อย ${d}/${t}`,
    doneToast: t => `✅ เสร็จ 100% (${t}/${t} ขั้นตอน)`,
    stoppedAt: (p, d, t) => `⏸ หยุดที่ ${p}% (${d}/${t})`,
    minimize: 'ย่อ',
    expand: 'ขยาย',
    close: 'ปิด',
    closed: 'ปิดแถบความคืบหน้าแล้ว พิมพ์ /progress เพื่อแสดงอีกครั้ง',
    command: 'แสดงแถบความคืบหน้าของงาน',
    reopened: 'แสดงแถบความคืบหน้าแล้ว',
    empty: 'ยังไม่มีรายการงาน แถบจะแสดงเมื่อ Claude วางแผนงาน',
  },
  fr: {
    bigSteps: (d, t) => `(${d}/${t} étapes principales)`,
    stopped: 'Arrêté',
    doing: 'En cours :',
    thisStep: (p, d, t) => `cette étape ${p} % · ${d}/${t} sous-étapes`,
    doneToast: t => `✅ Terminé à 100 % (${t}/${t} étapes)`,
    stoppedAt: (p, d, t) => `⏸ Arrêté à ${p} % (${d}/${t})`,
    minimize: 'Réduire',
    expand: 'Agrandir',
    close: 'Fermer',
    closed: 'Barre de progression fermée. Tapez /progress pour la réafficher.',
    command: 'Afficher la barre de progression de la tâche',
    reopened: 'Barre de progression affichée.',
    empty: 'Aucune liste de tâches pour l’instant. La barre apparaît dès que Claude planifie une tâche.',
  },
  es: {
    bigSteps: (d, t) => `(${d}/${t} pasos principales)`,
    stopped: 'Detenido',
    doing: 'Ahora:',
    thisStep: (p, d, t) => `este paso ${p}% · ${d}/${t} subpasos`,
    doneToast: t => `✅ 100% completado (${t}/${t} pasos)`,
    stoppedAt: (p, d, t) => `⏸ Detenido en ${p}% (${d}/${t})`,
    minimize: 'Minimizar',
    expand: 'Expandir',
    close: 'Cerrar',
    closed: 'Barra de progreso cerrada. Escribe /progress para volver a mostrarla.',
    command: 'Mostrar la barra de progreso de la tarea',
    reopened: 'Barra de progreso visible.',
    empty: 'Aún no hay lista de tareas. La barra aparece en cuanto Claude planifica una tarea.',
  },
  de: {
    bigSteps: (d, t) => `(${d}/${t} Hauptschritte)`,
    stopped: 'Gestoppt',
    doing: 'Aktuell:',
    thisStep: (p, d, t) => `dieser Schritt ${p} % · ${d}/${t} Teilschritte`,
    doneToast: t => `✅ 100 % erledigt (${t}/${t} Schritte)`,
    stoppedAt: (p, d, t) => `⏸ Gestoppt bei ${p} % (${d}/${t})`,
    minimize: 'Minimieren',
    expand: 'Erweitern',
    close: 'Schließen',
    closed: 'Fortschrittsleiste geschlossen. Mit /progress wieder anzeigen.',
    command: 'Fortschrittsleiste der Aufgabe anzeigen',
    reopened: 'Fortschrittsleiste angezeigt.',
    empty: 'Noch keine Aufgabenliste. Die Leiste erscheint, sobald Claude eine Aufgabe plant.',
  },
  pt: {
    bigSteps: (d, t) => `(${d}/${t} etapas principais)`,
    stopped: 'Parado',
    doing: 'Agora:',
    thisStep: (p, d, t) => `esta etapa ${p}% · ${d}/${t} subetapas`,
    doneToast: t => `✅ 100% concluído (${t}/${t} etapas)`,
    stoppedAt: (p, d, t) => `⏸ Parado em ${p}% (${d}/${t})`,
    minimize: 'Minimizar',
    expand: 'Expandir',
    close: 'Fechar',
    closed: 'Barra de progresso fechada. Digite /progress para mostrá-la de novo.',
    command: 'Mostrar a barra de progresso da tarefa',
    reopened: 'Barra de progresso exibida.',
    empty: 'Ainda não há lista de tarefas. A barra aparece assim que o Claude planejar uma tarefa.',
  },
  id: {
    bigSteps: (d, t) => `(${d}/${t} langkah utama)`,
    stopped: 'Berhenti',
    doing: 'Sedang:',
    thisStep: (p, d, t) => `langkah ini ${p}% · ${d}/${t} sub-langkah`,
    doneToast: t => `✅ Selesai 100% (${t}/${t} langkah)`,
    stoppedAt: (p, d, t) => `⏸ Berhenti di ${p}% (${d}/${t})`,
    minimize: 'Perkecil',
    expand: 'Perluas',
    close: 'Tutup',
    closed: 'Bilah progres ditutup. Ketik /progress untuk menampilkannya lagi.',
    command: 'Tampilkan bilah progres tugas',
    reopened: 'Bilah progres ditampilkan.',
    empty: 'Belum ada daftar tugas. Bilah muncul begitu Claude merencanakan tugas.',
  },
}

/** Ngôn ngữ của chính các bước (Claude viết bước bằng ngôn ngữ đang chat). */
export const detectFromText = (text: string): Lang | undefined => {
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text)) return 'vi'
  if (/[぀-ヿ]/.test(text)) return 'ja'
  if (/[가-힯]/.test(text)) return 'ko'
  if (/[฀-๿]/.test(text)) return 'th'
  if (/[一-鿿]/.test(text)) return 'zh'
  return undefined
}

/** "vi_VN.UTF-8" → "vi". */
export const fromLocale = (locale: string | undefined): Lang | undefined => {
  const code = locale?.toLowerCase().match(/^[a-z]{2}/)?.[0]
  if (code === 'in') return 'id'
  return LANGS.find(l => l === code)
}

/** Tuỳ chọn → chữ trong các bước → LANG của máy → tiếng Anh. */
export const pickLang = (option: unknown, titles: string, locale: string | undefined): Lang => {
  const chosen = LANGS.find(l => l === option)
  return chosen ?? detectFromText(titles) ?? fromLocale(locale) ?? 'en'
}
