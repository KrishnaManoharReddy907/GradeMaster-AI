import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, ArrowLeft, Clock, X } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { studentAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardContent } from '../../components/Card'
import Button from '../../components/Button'

export default function SolveManual() {
  const { id: assessmentId } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()

  const [assessment, setAssessment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('upload') // upload | processing | submitted
  const [files, setFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingMessage, setProcessingMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const data = await studentAPI.getAssessmentDetail(token, assessmentId)
        setAssessment(data)
        // Check if already submitted
        try {
          const status = await studentAPI.getSubmissionStatus(token, assessmentId)
          if (status.manual_submitted) {
            setStep('already-submitted')
          }
        } catch { /* ignore */ }
      } catch (err) {
        addToast('Failed to load assessment', 'error')
        navigate('/student/assessments')
      } finally {
        setLoading(false)
      }
    }
    fetchAssessment()
  }, [token, assessmentId, navigate, addToast])

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const droppedFiles = Array.from(e.dataTransfer.files || [])
    validateAndAddFiles(droppedFiles)
  }, [])

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp', 'application/pdf']

  const validateAndAddFiles = (newFiles) => {
    const valid = []
    for (const f of newFiles) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setError(`"${f.name}" — Invalid file type. Allowed: JPG, PNG, BMP, TIFF, WEBP, PDF`)
        return
      }
      if (f.size > 20 * 1024 * 1024) {
        setError(`"${f.name}" — File too large. Maximum size: 20MB per file`)
        return
      }
      valid.push(f)
    }
    setFiles(prev => [...prev, ...valid])
    setError('')
  }

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length > 0) validateAndAddFiles(selected)
    e.target.value = '' // reset so same file can be re-added
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (files.length === 0) {
      addToast('Please select at least one file', 'warning')
      return
    }

    setStep('processing')
    setProcessing(true)
    setError('')

    try {
      // Step 1: Upload & OCR each file, concatenate text
      let allRawText = ''
      for (let i = 0; i < files.length; i++) {
        setProcessingMessage(`Extracting text from page ${i + 1} of ${files.length}...`)
        const ocrResult = await studentAPI.uploadHandwritten(token, files[i])
        if (ocrResult.raw_text) {
          allRawText += (allRawText ? '\n\n' : '') + ocrResult.raw_text
        }
      }

      if (!allRawText.trim()) {
        throw new Error('Could not extract any text from the uploaded files. Please ensure the images are clear.')
      }

      // Step 2: Clean & Segment (pass questions for smart mapping)
      setProcessingMessage('Cleaning and processing text...')
      const manualQuestions = (assessment.manual_questions || []).map((q, i) => ({
        question_id: q.question_id || `Q${i + 1}`,
        question_text: q.question_text || q.text || `Question ${i + 1}`,
      }))
      const processResult = await studentAPI.processHandwritten(token, allRawText, manualQuestions)

      // Step 3: Submit for evaluation
      setProcessingMessage('Submitting your answers...')
      const answers = {}
      if (processResult.answers && processResult.answers.length > 0) {
        processResult.answers.forEach(a => {
          answers[a.question] = a.answer
        })
      } else {
        answers['Q1'] = processResult.cleaned_text || allRawText
      }

      await studentAPI.evaluateHandwritten(token, {
        assessment_id: assessmentId,
        answers: answers,
      })

      setStep('submitted')
      addToast('Assignment submitted successfully!', 'success')

    } catch (err) {
      console.error('Manual submission failed:', err)
      setError(err.message || 'Submission failed. Please try again.')
      setStep('upload')
      addToast(err.message || 'Submission failed', 'error')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/student/assessments')} className="p-2 hover:bg-surface-light rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{assessment?.title || 'Manual Assignment'}</h1>
          <p className="text-text-secondary text-sm mt-1">
            {assessment?.description || 'Upload your handwritten answers for evaluation'}
          </p>
        </div>
      </div>

      {/* Already Submitted */}
      {step === 'already-submitted' && (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-text-primary mb-2">Already Submitted</h3>
              <p className="text-text-secondary mb-2">You have already submitted this assignment.</p>
              <div className="flex items-center justify-center gap-2 text-sm text-amber-400 mb-6">
                <Clock className="w-4 h-4" />
                <span>Awaiting teacher review</span>
              </div>
              <Button onClick={() => navigate('/student/assessments')}>Back to Assessments</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Upload Your Handwritten Answer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Instructions */}
            {assessment?.instructions && (
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                <p className="text-sm text-text-secondary">{assessment.instructions}</p>
              </div>
            )}

            {/* Questions Preview */}
            {assessment?.manual_questions?.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Questions</h3>
                {assessment.manual_questions.map((q, i) => (
                  <div key={i} className="p-3 bg-surface-light/50 rounded-lg border border-border/30">
                    <span className="text-xs font-semibold text-primary">{q.question_id}</span>
                    <span className="text-xs text-text-secondary ml-2">({q.marks} marks)</span>
                    <p className="text-sm text-text-primary mt-1">{q.question_text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                dragActive
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : files.length > 0
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-border hover:border-primary/40 hover:bg-surface-light/30'
              }`}
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".jpg,.jpeg,.png,.bmp,.tiff,.webp,.pdf"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="space-y-3">
                <div className={`w-14 h-14 ${files.length > 0 ? 'bg-emerald-500/10' : 'bg-primary/10'} rounded-2xl flex items-center justify-center mx-auto`}>
                  <Upload className={`w-7 h-7 ${files.length > 0 ? 'text-emerald-400' : 'text-primary'}`} />
                </div>
                <div>
                  <p className="text-text-primary font-medium">
                    {files.length > 0 ? 'Click or drop to add more pages' : 'Drop your files here or click to browse'}
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    Supports: JPG, PNG, PDF, BMP, TIFF, WEBP (max 20MB each) • Multiple files allowed
                  </p>
                </div>
              </div>
            </div>

            {/* Selected Files List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-text-secondary">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </h3>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-surface-light/50 rounded-xl border border-border/30">
                    <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{f.name}</p>
                      <p className="text-xs text-text-secondary">{(f.size / 1024).toFixed(1)} KB — Page {i + 1}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                      className="p-1 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={files.length === 0}
            >
              <Upload className="w-4 h-4" />
              Upload & Submit for Evaluation ({files.length} {files.length === 1 ? 'file' : 'files'})
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Processing Step */}
      {step === 'processing' && (
        <Card>
          <CardContent>
            <div className="text-center py-16">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-primary rounded-full animate-spin"></div>
                <div className="absolute inset-3 bg-primary/10 rounded-full flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-text-primary mb-2">Processing Your Assignment</h3>
              <p className="text-text-secondary animate-pulse">{processingMessage}</p>
              <div className="flex justify-center gap-2 mt-6">
                {['OCR', 'Clean', 'Submit'].map((s, i) => (
                  <div key={s} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    processingMessage.includes('Extract') && i === 0 ? 'bg-primary text-white' :
                    processingMessage.includes('Clean') && i === 1 ? 'bg-primary text-white' :
                    processingMessage.includes('Submit') && i === 2 ? 'bg-primary text-white' :
                    'bg-surface-light text-text-secondary'
                  }`}>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submitted Successfully — No scores shown */}
      {step === 'submitted' && (
        <Card className="border border-emerald-500/20">
          <CardContent>
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-text-primary mb-3">Submitted Successfully!</h3>
              <p className="text-text-secondary mb-2">Your assignment has been submitted for evaluation.</p>
              <div className="flex items-center justify-center gap-2 text-sm text-amber-400 mb-8">
                <Clock className="w-4 h-4" />
                <span>Your teacher will review and finalize the score. Results will be available after review.</span>
              </div>
              <Button variant="secondary" onClick={() => navigate('/student/assessments')}>
                <ArrowLeft className="w-4 h-4" />
                Back to Assessments
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
