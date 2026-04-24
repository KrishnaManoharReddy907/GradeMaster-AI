import Editor from '@monaco-editor/react'
import { Loader as LoaderIcon } from 'lucide-react'

export default function CodeEditor({
  value,
  onChange,
  language = 'python',
  height = '400px',
  readOnly = false,
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={onChange}
        theme="vs-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Fira Code, monospace',
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          wordWrap: 'on',
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-card">
            <LoaderIcon className="w-6 h-6 animate-spin text-primary" />
          </div>
        }
      />
    </div>
  )
}
