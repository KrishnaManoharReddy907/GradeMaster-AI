import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...args) => twMerge(clsx(args))

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const rel = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export const toDate = (v) => (v ? new Date(v) : null)
export const fmtDate = (v) => (v ? dateFmt.format(new Date(v)) : '—')
export const fmtDateTime = (v) => (v ? dateTimeFmt.format(new Date(v)) : '—')

export function fromNow(v) {
  if (!v) return '—'
  const diff = (new Date(v) - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return rel.format(Math.round(diff), 'second')
  if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day')
  return fmtDate(v)
}

export function fmtNum(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number.isInteger(v) ? String(v) : Number(v).toFixed(digits).replace(/\.0+$/, '')
}

export const fmtPct = (v) => (v === null || v === undefined ? '—' : `${fmtNum(v)}%`)

export function duration(ms) {
  if (ms <= 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** Display letter for the option at position i (A, B, C…), independent of stored option ids. */
export const optionLabel = (i) => String.fromCharCode(65 + i)

export const TYPE_LABELS = { mcq: 'MCQ', coding: 'Coding', manual: 'Handwritten', mixed: 'Mixed' }

export const FLAG_LABELS = {
  possible_plagiarism: 'Possible plagiarism',
  possible_prompt_injection: 'Suspicious instructions in answer',
  ai_unavailable: 'AI scoring unavailable',
  ai_feedback_unavailable: 'AI feedback unavailable',
  low_ocr_confidence: 'Low OCR confidence',
  score_disagreement: 'Keyword vs AI disagreement',
  low_ai_confidence: 'Low AI confidence',
  execution_incomplete: 'Some tests did not run',
  evaluation_failed: 'Evaluation failed',
  left_exam: 'Left the exam window',
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
