import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, Code2, Fingerprint, LibraryBig, ListChecks, PenLine, ScanText, ShieldCheck, Sparkles, UserCheck,
} from 'lucide-react'
import { Logo, ThemeToggle } from '@/components/AppShell'
import { Button, Callout } from '@/components/ui'
import { api } from '@/lib/api'
import { homeFor, useAuth } from '@/lib/auth'
import { useAsync, useDocumentTitle } from '@/lib/hooks'

const PIPELINES = [
  { icon: ListChecks, title: 'Multiple choice', text: 'Timed exams with a question palette, autosave and instant scoring. Wrong answers get a short explanation.',
    steps: ['Answer', 'Auto-score', 'Explain mistakes'] },
  { icon: Code2, title: 'Coding', text: 'Submissions run in a sandbox against visible and hidden tests. AI writes feedback and a minimal fix; similar code gets flagged.',
    steps: ['Sandbox run', 'Analyse & compare', 'Feedback'] },
  { icon: PenLine, title: 'Handwritten', text: 'Photos or PDFs are read by OCR, matched to questions and scored against your model answer, keywords and rubric.',
    steps: ['OCR', 'Map answers', 'Rubric scoring'] },
]

const FEATURES = [
  { icon: UserCheck, title: 'Teachers have the final say', text: 'AI scores are provisional. Nothing reaches a student until a teacher reviews and finalizes it.' },
  { icon: ShieldCheck, title: 'Review queue that explains itself', text: 'Low OCR confidence, AI disagreement, suspected prompt injection and possible copying are flagged and sorted first.' },
  { icon: Fingerprint, title: 'Structural plagiarism detection', text: 'Renamed variables and reformatting don’t hide copying. Matching lines are shown side by side.' },
  { icon: BarChart3, title: 'Topic mastery', text: 'See which topics a class, or one student, is strong or weak in, built only from confirmed grades.' },
  { icon: LibraryBig, title: 'Question bank', text: 'Save, reuse and share questions across terms and sections.' },
  { icon: Sparkles, title: 'AI question drafts', text: 'Draft MCQs or descriptive questions with model answers and rubrics. You edit before anything is used.' },
]

export default function Landing() {
  useDocumentTitle('')
  const { user } = useAuth()
  const setup = useAsync(() => api.auth.checkSetup(), [])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-15 max-w-6xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {user ? (
              <Link to={homeFor(user.role)}><Button size="sm" icon={ArrowRight}>Open dashboard</Button></Link>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
                <Link to="/signup"><Button size="sm">Get started</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
          {setup.data?.setup_required && (
            <Callout tone="warn" className="mb-8 max-w-xl" title="Finish setting up">
              No administrator exists yet. <Link to="/setup" className="font-semibold underline">Create the administrator account</Link> to get started.
            </Callout>
          )}
          <div className="max-w-3xl animate-in">
            <p className="eyebrow mb-4">Autonomous assignment evaluation</p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Grade MCQ, code and handwriting in one place, <span className="text-brand">with teachers in control.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">
              GradeMaster runs code in a sandbox, reads handwritten answers, scores them against your rubric, and points out
              the submissions that need your attention. You review, adjust and release.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={user ? homeFor(user.role) : '/signup'}><Button size="lg" icon={ArrowRight}>{user ? 'Go to dashboard' : 'Create an account'}</Button></Link>
              {!user && <Link to="/login"><Button size="lg" variant="secondary">Sign in</Button></Link>}
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-14 md:grid-cols-3">
            {PIPELINES.map((p) => (
              <div key={p.title}>
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"><p.icon className="h-5 w-5" /></div>
                <h2 className="text-lg font-semibold">{p.title}</h2>
                <p className="mt-2 text-ink-2">{p.text}</p>
                <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                  {p.steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-1.5">
                      <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5">{s}</span>
                      {i < p.steps.length - 1 && <ArrowRight className="h-3 w-3" aria-hidden />}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold">Built for the review step, not just the scoring step</h2>
            <p className="mt-2 text-ink-2">Automatic scoring only saves time if you can trust it, so GradeMaster shows its evidence and its doubts.</p>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-ink-2">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="card flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <ScanText className="mt-1 h-6 w-6 shrink-0 text-brand" aria-hidden />
              <div>
                <h2 className="text-xl font-semibold">Ready when your class is</h2>
                <p className="mt-1 text-ink-2">Students sign up with their department, year and section; faculty are approved by your administrator.</p>
              </div>
            </div>
            <Link to={user ? homeFor(user.role) : '/signup'}><Button size="lg">{user ? 'Open dashboard' : 'Get started'}</Button></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13px] text-ink-3">
          <Logo />
          <p>MCQ · Coding · Handwritten evaluation</p>
        </div>
      </footer>
    </div>
  )
}
