import { lazy, Suspense } from 'react'
import { useTheme } from '@/lib/ui-state'
import { Spinner } from './ui'
import { cn } from '@/lib/utils'

const Monaco = lazy(() => import('@monaco-editor/react'))

export const MONACO_LANG = { python: 'python', java: 'java', cpp: 'cpp', c: 'c', javascript: 'javascript' }
export const LANGUAGE_LABEL = { python: 'Python 3', java: 'Java', cpp: 'C++', c: 'C', javascript: 'JavaScript' }

export function CodeEditor({ value, onChange, language = 'python', height = 420, readOnly = false }) {
  const { theme } = useTheme()
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <Suspense fallback={<div className="grid place-items-center bg-surface-2" style={{ height }}><Spinner /></div>}>
        <Monaco height={height} language={MONACO_LANG[language] || 'plaintext'} value={value} onChange={(v) => onChange?.(v ?? '')}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          loading={<div className="grid h-full place-items-center"><Spinner /></div>}
          options={{
            readOnly, minimap: { enabled: false }, fontSize: 13.5, fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
            fontLigatures: true, padding: { top: 14, bottom: 14 }, scrollBeyondLastLine: false, automaticLayout: true,
            tabSize: 4, renderLineHighlight: 'line', wordWrap: 'on', smoothScrolling: true, bracketPairColorization: { enabled: true },
          }} />
      </Suspense>
    </div>
  )
}

/** Read-only code with optional highlighted line numbers (1-based). */
export function CodeView({ code, highlight = [], className, maxHeight = 520 }) {
  const lines = (code || '').replace(/\r\n/g, '\n').split('\n')
  const marked = new Set(highlight)
  return (
    <div className={cn('overflow-auto rounded-xl border border-line bg-surface-2 py-2 font-mono text-[12.5px] leading-[1.6]', className)} style={{ maxHeight }}>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className={marked.has(i + 1) ? 'bg-warn-soft' : undefined}>
              <td className="sticky left-0 select-none border-r border-line bg-inherit px-3 text-right text-ink-3 tabular" style={{ width: 1 }}>{i + 1}</td>
              <td className="whitespace-pre px-3">{line || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
