import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Logo, ThemeToggle } from '@/components/AppShell'

const POINTS = [
  'MCQ, coding and handwritten work in one place',
  'Code runs in a sandbox against your test cases',
  'Handwriting read by OCR and graded against your rubric',
  'Every grade confirmed by a teacher before release',
]

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(440px,520px)]">
      <div className="relative hidden overflow-hidden border-r border-line bg-surface-2 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link to="/"><Logo /></Link>
        <div className="max-w-md">
          <p className="eyebrow mb-3">Assessment, evaluated</p>
          <h2 className="text-3xl font-semibold leading-tight">Grade faster without giving up the final say.</h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-ink-2">
                <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand" aria-hidden />{p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12.5px] text-ink-3">© {new Date().getFullYear()} GradeMaster</p>
      </div>
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Link to="/" className="lg:hidden"><Logo /></Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 animate-in">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-ink-3">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-[13px] text-ink-3">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
