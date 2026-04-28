import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, AlertTriangle, CheckCircle, Info, Clock } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Select } from '../../components/Input'
import CodeEditor from '../../components/CodeEditor'
import Loader from '../../components/Loader'
import Badge from '../../components/Badge'

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
]

// Full program templates — stdin/stdout style (CodeChef/HackerRank)
const DEFAULT_CODE = {
  python: `# Read input from stdin
# Write output to stdout
# Example:
# n = int(input())
# print(n * n)

n = int(input())
print(n)
`,
  javascript: `// Read input from stdin
// Write output to stdout
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
  const n = parseInt(lines[0]);
  console.log(n);
});
`,
  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(n);
    }
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    cout << n << endl;
    return 0;
}
`,
  c: `#include <stdio.h>

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", n);
    return 0;
}
`,
}

// Validation: check if code uses stdin/stdout patterns
function validateCode(code, language) {
  const warnings = []
  if (!code || !code.trim()) return warnings

  if (language === 'python') {
    if (!code.includes('input(')) {
      warnings.push('Your code does not use input(). Make sure you read from stdin.')
    }
    if (!code.includes('print(')) {
      warnings.push('Your code does not use print(). Make sure you write to stdout.')
    }
    // Check for function-only pattern (no top-level execution)
    if (/def\s+\w+\s*\(/.test(code) && !code.includes('input(') && !code.includes('print(')) {
      warnings.push('You defined a function but never call it. The system does NOT auto-call functions.')
    }
  } else if (language === 'javascript') {
    if (!code.includes('readline') && !code.includes('process.stdin')) {
      warnings.push('Your code may not read input. Use readline or process.stdin.')
    }
    if (!code.includes('console.log')) {
      warnings.push('Your code does not use console.log(). Make sure you write to stdout.')
    }
  } else if (language === 'java') {
    if (!code.includes('Scanner') && !code.includes('BufferedReader')) {
      warnings.push('Your code may not read input. Use Scanner or BufferedReader.')
    }
    if (!code.includes('System.out.print')) {
      warnings.push('Your code does not use System.out.println(). Make sure you write to stdout.')
    }
  } else if (language === 'cpp') {
    if (!code.includes('cin') && !code.includes('scanf')) {
      warnings.push('Your code may not read input. Use cin or scanf.')
    }
    if (!code.includes('cout') && !code.includes('printf')) {
      warnings.push('Your code may not write output. Use cout or printf.')
    }
  } else if (language === 'c') {
    if (!code.includes('scanf')) {
      warnings.push('Your code may not read input. Use scanf().')
    }
    if (!code.includes('printf')) {
      warnings.push('Your code may not write output. Use printf().')
    }
  }

  return warnings
}

export default function SolveCoding() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  
  const STORAGE_PREFIX = `coding_exam_${id}_`

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submittingMessage, setSubmittingMessage] = useState('')
  const [assessment, setAssessment] = useState(null)
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem(STORAGE_PREFIX + 'language') || 'python'
  })
  const [code, setCode] = useState(() => {
    return localStorage.getItem(STORAGE_PREFIX + 'code') || DEFAULT_CODE.python
  })
  const [codeWarnings, setCodeWarnings] = useState([])
  const [timeLeft, setTimeLeft] = useState(null)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const data = await studentAPI.getAssessmentDetail(token, id)
        setAssessment(data)

        // Restore timer from localStorage or initialize fresh
        const duration = data.duration_minutes || data.duration
        if (duration) {
          const savedDeadline = localStorage.getItem(STORAGE_PREFIX + 'deadline')
          if (savedDeadline) {
            const remaining = Math.max(0, Math.floor((parseInt(savedDeadline) - Date.now()) / 1000))
            setTimeLeft(remaining)
          } else {
            const totalSeconds = duration * 60
            setTimeLeft(totalSeconds)
            localStorage.setItem(STORAGE_PREFIX + 'deadline', String(Date.now() + totalSeconds * 1000))
          }
          startTimeRef.current = Date.now()
        }

        // Restore saved code/language if present
        const savedCode = localStorage.getItem(STORAGE_PREFIX + 'code')
        const savedLang = localStorage.getItem(STORAGE_PREFIX + 'language')
        if (savedCode) setCode(savedCode)
        if (savedLang) setLanguage(savedLang)
      } catch (error) {
        console.error('Failed to fetch assessment:', error)
        addToast(error.message || 'Failed to load assessment', 'error')
        navigate('/student/assessments')
      } finally {
        setLoading(false)
      }
    }

    fetchAssessment()
  }, [id, token, addToast, navigate])

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [timeLeft !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && !submitting) {
      addToast('Time is up! Auto-submitting your code...', 'warning')
      handleSubmit()
    }
  }, [timeLeft]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Format time display
  const formatTime = (seconds) => {
    if (seconds === null) return null
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isCriticalTime = timeLeft !== null && timeLeft <= 300 // < 5 min

  // Validate code on change
  useEffect(() => {
    const warnings = validateCode(code, language)
    setCodeWarnings(warnings)
  }, [code, language])

  // Persist code to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'code', code)
  }, [code])

  // Persist language to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'language', language)
  }, [language])

  const handleLanguageChange = (e) => {
    const newLang = e.target.value
    setLanguage(newLang)
    // Only reset to template if no saved code for this language
    const savedCode = localStorage.getItem(STORAGE_PREFIX + 'code')
    if (!savedCode || savedCode === DEFAULT_CODE[language]) {
      setCode(DEFAULT_CODE[newLang])
    } else {
      // Ask before overwriting custom code
      const proceed = window.confirm('Switching language will reset your code. Continue?')
      if (proceed) {
        setCode(DEFAULT_CODE[newLang])
      } else {
        // Revert language change
        return
      }
    }
  }

  const handleSubmit = async () => {
    if (!code.trim()) {
      addToast('Please write some code before submitting', 'warning')
      return
    }

    // Show warnings but don't block
    if (codeWarnings.length > 0) {
      const proceed = window.confirm(
        `⚠️ Potential issues detected:\n\n${codeWarnings.join('\n')}\n\nDo you still want to submit?`
      )
      if (!proceed) return
    }

    setSubmitting(true)
    setSubmittingMessage('Submitting your code...')
    try {
      const codingQuestions = assessment.coding_questions || assessment.questions || []
      const questionId = codingQuestions.length > 0 
        ? (codingQuestions[0].question_id || codingQuestions[0].id || 'default')
        : 'default'

      setSubmittingMessage('Sending code to server...')
      await studentAPI.submitCoding(token, {
        assessment_id: id,
        question_id: questionId,
        code,
        language,
      })

      // Clear localStorage on successful submit
      localStorage.removeItem(STORAGE_PREFIX + 'code')
      localStorage.removeItem(STORAGE_PREFIX + 'language')
      localStorage.removeItem(STORAGE_PREFIX + 'deadline')

      setSubmittingMessage('Submitted successfully! ✓')
      addToast('Code submitted successfully!', 'success')
      // Brief pause so user sees the success state on the overlay
      await new Promise(resolve => setTimeout(resolve, 1500))
      navigate('/student/submissions')
    } catch (error) {
      console.error('Failed to submit code:', error)
      addToast(error.message || 'Failed to submit code', 'error')
    } finally {
      setSubmitting(false)
      setSubmittingMessage('')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size="lg" />
      </div>
    )
  }

  if (!assessment) return null

  const codingQuestions = assessment.coding_questions || []
  const currentProblem = codingQuestions.length > 0 ? codingQuestions[0] : null

  return (
    <div className="space-y-6">
      {/* Custom scrollbar styles */}
      <style>{`
        .coding-scroll::-webkit-scrollbar { width: 6px; }
        .coding-scroll::-webkit-scrollbar-track { background: transparent; }
        .coding-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        .coding-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
        .coding-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent; }
      `}</style>
      {/* ── Submission Overlay ── */}
      {submitting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)'
        }}>
          <div style={{
            width: 56, height: 56, border: '4px solid rgba(255,255,255,0.15)',
            borderTopColor: '#6366f1', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', marginBottom: 24
          }} />
          <p style={{ color: '#fff', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            {submittingMessage || 'Submitting...'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            Please wait — do not close this page
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/student/assessments')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">{assessment.title}</h1>
          <p className="text-text-secondary mt-1">Coding Assessment</p>
        </div>
        {/* Timer */}
        {timeLeft !== null && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${
            isCriticalTime
              ? 'bg-error/10 text-error border border-error/30 animate-pulse'
              : 'bg-primary/10 text-primary border border-primary/30'
          }`}>
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Problem Description — independent scroll */}
        <div className="overflow-y-auto coding-scroll pr-3" style={{ maxHeight: 'calc(100vh - 140px)' }}>
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            {currentProblem?.title || 'Problem Description'}
          </h2>
          <div className="prose prose-invert max-w-none">
            <p className="text-text-secondary leading-relaxed whitespace-pre-wrap">
              {currentProblem?.problem_statement || assessment.description || 'No description provided'}
            </p>
          </div>

          {currentProblem?.input_format && (
            <div className="mt-4">
              <h3 className="text-md font-semibold text-text-primary mb-2">Input Format</h3>
              <p className="text-text-secondary text-sm whitespace-pre-wrap">{currentProblem.input_format}</p>
            </div>
          )}

          {currentProblem?.output_format && (
            <div className="mt-4">
              <h3 className="text-md font-semibold text-text-primary mb-2">Output Format</h3>
              <p className="text-text-secondary text-sm whitespace-pre-wrap">{currentProblem.output_format}</p>
            </div>
          )}

          {currentProblem?.constraints && (
            <div className="mt-4">
              <h3 className="text-md font-semibold text-text-primary mb-2">Constraints</h3>
              <p className="text-text-secondary text-sm whitespace-pre-wrap font-mono">{currentProblem.constraints}</p>
            </div>
          )}

          {/* Sample test cases */}
          {currentProblem?.sample_input && (
            <div className="mt-4">
              <h3 className="text-md font-semibold text-text-primary mb-3">Sample</h3>
              <div className="bg-background rounded-xl p-4">
                <div className="mb-2">
                  <span className="text-xs text-text-secondary font-medium">Input:</span>
                  <pre className="text-sm text-text-primary mt-1 font-mono">{currentProblem.sample_input}</pre>
                </div>
                <div>
                  <span className="text-xs text-text-secondary font-medium">Output:</span>
                  <pre className="text-sm text-text-primary mt-1 font-mono">{currentProblem.sample_output}</pre>
                </div>
              </div>
            </div>
          )}

          {/* Fallback: show test_cases if available */}
          {!currentProblem && assessment.test_cases && assessment.test_cases.length > 0 && (
            <>
              <h3 className="text-md font-semibold text-text-primary mt-6 mb-3">Sample Test Cases</h3>
              <div className="space-y-3">
                {assessment.test_cases.filter(tc => !tc.hidden && !tc.is_hidden).slice(0, 2).map((testCase, index) => (
                  <div key={index} className="bg-background rounded-xl p-4">
                    <div className="mb-2">
                      <span className="text-xs text-text-secondary font-medium">Input:</span>
                      <pre className="text-sm text-text-primary mt-1 font-mono">{testCase.input}</pre>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary font-medium">Expected Output:</span>
                      <pre className="text-sm text-text-primary mt-1 font-mono">{testCase.expected_output}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Execution Model Info */}
          <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
              <Info className="w-4 h-4" />
              How your code is executed
            </h3>
            <div className="text-xs text-text-secondary space-y-1">
              <p>• Your code runs as a <strong className="text-text-primary">complete program</strong></p>
              <p>• Read input using <code className="text-primary">input()</code> / <code className="text-primary">cin</code> / <code className="text-primary">Scanner</code></p>
              <p>• Print output using <code className="text-primary">print()</code> / <code className="text-primary">cout</code> / <code className="text-primary">System.out.println</code></p>
              <p>• <strong className="text-error">Do NOT</strong> define a function and expect it to be called automatically</p>
            </div>
          </div>
        </Card>
        </div>

        {/* Code Editor — independent scroll */}
        <div className="flex flex-col" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          {/* Sticky toolbar — stays fixed at top */}
          <div className="flex items-center justify-between px-1 py-2 mb-3 border-b border-border/50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Select
                value={language}
                onChange={handleLanguageChange}
                className="w-44"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-text-secondary hidden md:inline">v{language === 'python' ? '3.x' : language === 'java' ? '17' : language === 'cpp' ? '17' : language === 'c' ? '11' : 'ES6'}</span>
            </div>
            <Button onClick={handleSubmit} loading={submitting} className="px-6">
              <Send className="w-4 h-4" />
              Submit Code
            </Button>
          </div>

          {/* Scrollable content area */}
          <div className="overflow-y-auto coding-scroll pr-3 flex-1">
          <div className="space-y-4">

          {/* Helper text */}
          <div className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg">
            <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
            <p className="text-xs text-text-secondary">
              Write a complete program. Read input using <code className="text-primary">input()</code> and print output using <code className="text-primary">print()</code>. 
              Do NOT define functions unless required.
            </p>
          </div>

          {/* Warnings */}
          {codeWarnings.length > 0 && (
            <div className="space-y-1">
              {codeWarnings.map((warning, index) => (
                <div key={index} className="flex items-start gap-2 px-3 py-2 bg-warning/10 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">{warning}</p>
                </div>
              ))}
            </div>
          )}

          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
            height="500px"
          />

          {/* Valid / Invalid examples */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-success/5 border border-success/20 rounded-xl">
              <p className="text-xs font-semibold text-success mb-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Valid Code
              </p>
              <pre className="text-xs text-text-secondary font-mono leading-relaxed">
{`n = int(input())
print(n * n)`}
              </pre>
            </div>
            <div className="p-3 bg-error/5 border border-error/20 rounded-xl">
              <p className="text-xs font-semibold text-error mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Invalid Code
              </p>
              <pre className="text-xs text-text-secondary font-mono leading-relaxed">
{`def solution(n):
    return n * n`}
              </pre>
              <p className="text-xs text-error/70 mt-1">System won't call this</p>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
