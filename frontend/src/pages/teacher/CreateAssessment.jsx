import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, FileQuestion, Code } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { teacherAPI, adminAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input, { Select, Textarea } from '../../components/Input'

export default function CreateAssessment() {
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [sections, setSections] = useState([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    subject_id: '',
    section_ids: [],
    assessment_type: 'mcq',
    duration_minutes: '',
    total_marks: '',
    start_time: '',
    end_time: '',
    instructions: '',
  })
  const [mcqQuestions, setMcqQuestions] = useState([])
  const [codingQuestions, setCodingQuestions] = useState([])

  // Fetch subjects and sections for dropdowns
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [subjectsRes, sectionsRes] = await Promise.all([
          adminAPI.getSubjects(token).catch(() => []),
          adminAPI.getSections(token).catch(() => []),
        ])
        setSubjects(Array.isArray(subjectsRes) ? subjectsRes : [])
        setSections(Array.isArray(sectionsRes) ? sectionsRes : [])
      } catch (error) {
        console.error('Failed to fetch subjects/sections:', error)
      }
    }
    fetchData()
  }, [token])

  const handleSectionToggle = (sectionId) => {
    setForm(prev => ({
      ...prev,
      section_ids: prev.section_ids.includes(sectionId)
        ? prev.section_ids.filter(id => id !== sectionId)
        : [...prev.section_ids, sectionId]
    }))
  }

  // MCQ Question helpers
  const addMcqQuestion = () => {
    setMcqQuestions([...mcqQuestions, {
      question_id: `q${Date.now()}`,
      question_text: '',
      options: [
        { option_id: 'a', text: '' },
        { option_id: 'b', text: '' },
        { option_id: 'c', text: '' },
        { option_id: 'd', text: '' },
      ],
      correct_option_id: 'a',
      marks: 1,
      difficulty: 'medium',
    }])
  }

  const updateMcqQuestion = (index, field, value) => {
    const updated = [...mcqQuestions]
    updated[index][field] = value
    setMcqQuestions(updated)
  }

  const updateMcqOption = (qIndex, oIndex, value) => {
    const updated = [...mcqQuestions]
    updated[qIndex].options[oIndex].text = value
    setMcqQuestions(updated)
  }

  const removeMcqQuestion = (index) => {
    setMcqQuestions(mcqQuestions.filter((_, i) => i !== index))
  }

  // Coding Question helpers
  const addCodingQuestion = () => {
    setCodingQuestions([...codingQuestions, {
      question_id: `cq${Date.now()}`,
      title: '',
      problem_statement: '',
      input_format: '',
      output_format: '',
      constraints: '',
      sample_input: '',
      sample_output: '',
      test_cases: [{ input: '', expected_output: '', is_hidden: false }],
      marks: 10,
      difficulty: 'medium',
      time_limit_seconds: 2,
      memory_limit_mb: 256,
    }])
  }

  const updateCodingQuestion = (index, field, value) => {
    const updated = [...codingQuestions]
    updated[index][field] = value
    setCodingQuestions(updated)
  }

  const addTestCase = (qIndex) => {
    const updated = [...codingQuestions]
    updated[qIndex].test_cases.push({ input: '', expected_output: '', is_hidden: false })
    setCodingQuestions(updated)
  }

  const updateTestCase = (qIndex, tcIndex, field, value) => {
    const updated = [...codingQuestions]
    updated[qIndex].test_cases[tcIndex][field] = value
    setCodingQuestions(updated)
  }

  const removeTestCase = (qIndex, tcIndex) => {
    const updated = [...codingQuestions]
    updated[qIndex].test_cases = updated[qIndex].test_cases.filter((_, i) => i !== tcIndex)
    setCodingQuestions(updated)
  }

  const removeCodingQuestion = (index) => {
    setCodingQuestions(codingQuestions.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!form.title) {
      addToast('Please enter a title', 'warning')
      return
    }
    if (!form.subject_id) {
      addToast('Please select a subject', 'warning')
      return
    }
    if (form.section_ids.length === 0) {
      addToast('Please select at least one section', 'warning')
      return
    }
    if (!form.duration_minutes) {
      addToast('Please enter duration', 'warning')
      return
    }
    if (!form.total_marks) {
      addToast('Please enter total marks', 'warning')
      return
    }
    if (!form.start_time || !form.end_time) {
      addToast('Please set start and end times', 'warning')
      return
    }

    if (form.assessment_type === 'mcq' && mcqQuestions.length === 0) {
      addToast('Please add at least one MCQ question', 'warning')
      return
    }

    if (form.assessment_type === 'coding' && codingQuestions.length === 0) {
      addToast('Please add at least one coding question', 'warning')
      return
    }

    setLoading(true)
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        subject_id: form.subject_id,
        section_ids: form.section_ids,
        assessment_type: form.assessment_type,
        duration_minutes: parseInt(form.duration_minutes),
        total_marks: parseInt(form.total_marks),
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        instructions: form.instructions || null,
        mcq_questions: form.assessment_type === 'mcq' || form.assessment_type === 'mixed' ? mcqQuestions : [],
        coding_questions: form.assessment_type === 'coding' || form.assessment_type === 'mixed' ? codingQuestions : [],
      }

      await teacherAPI.createAssessment(token, payload)
      addToast('Assessment created successfully!', 'success')
      navigate('/teacher/assessments')
    } catch (error) {
      console.error('Failed to create assessment:', error)
      addToast(error.message || 'Failed to create assessment', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/teacher')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Create Assessment</h1>
          <p className="text-text-secondary mt-1">Create a new assessment for your students</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Basic Information</h2>
          <div className="space-y-4">
            <Input
              label="Title"
              placeholder="Enter assessment title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Textarea
              label="Description"
              placeholder="Enter assessment description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Assessment Type"
                value={form.assessment_type}
                onChange={(e) => {
                  setForm({ ...form, assessment_type: e.target.value })
                  setMcqQuestions([])
                  setCodingQuestions([])
                }}
              >
                <option value="mcq">MCQ Assessment</option>
                <option value="coding">Coding Assessment</option>
                <option value="mixed">Mixed (MCQ + Coding)</option>
              </Select>
              <Select
                label="Subject"
                value={form.subject_id}
                onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
              >
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Duration (minutes)"
                type="number"
                placeholder="e.g., 60"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
              <Input
                label="Total Marks"
                type="number"
                placeholder="e.g., 100"
                value={form.total_marks}
                onChange={(e) => setForm({ ...form, total_marks: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Time"
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
              <Input
                label="End Time"
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>

            {/* Section multi-select */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Sections</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sections.map((section) => (
                  <label
                    key={section.id}
                    className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                      form.section_ids.includes(section.id)
                        ? 'border-primary bg-primary/10 text-text-primary'
                        : 'border-border bg-card text-text-secondary hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.section_ids.includes(section.id)}
                      onChange={() => handleSectionToggle(section.id)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <span className="text-sm">{section.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <Textarea
              label="Instructions (optional)"
              placeholder="Enter instructions for students"
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              rows={2}
            />
          </div>
        </Card>

        {/* MCQ Questions */}
        {(form.assessment_type === 'mcq' || form.assessment_type === 'mixed') && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">MCQ Questions</h2>
              <Button type="button" variant="secondary" onClick={addMcqQuestion}>
                <Plus className="w-4 h-4" />
                Add Question
              </Button>
            </div>

            {mcqQuestions.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <FileQuestion className="w-12 h-12 mx-auto mb-4" />
                <p>No questions added yet. Click &quot;Add Question&quot; to get started.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {mcqQuestions.map((question, qIndex) => (
                  <div key={qIndex} className="p-4 bg-background rounded-xl">
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-sm font-medium text-primary">Question {qIndex + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMcqQuestion(qIndex)}
                        className="text-error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Enter question text"
                      value={question.question_text}
                      onChange={(e) => updateMcqQuestion(qIndex, 'question_text', e.target.value)}
                      rows={2}
                      className="mb-4"
                    />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Input
                        label="Marks"
                        type="number"
                        value={question.marks}
                        onChange={(e) => updateMcqQuestion(qIndex, 'marks', parseInt(e.target.value) || 1)}
                      />
                      <Select
                        label="Difficulty"
                        value={question.difficulty}
                        onChange={(e) => updateMcqQuestion(qIndex, 'difficulty', e.target.value)}
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      {question.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex items-center gap-3">
                          <input
                            type="radio"
                            name={`correct-${qIndex}`}
                            checked={question.correct_option_id === option.option_id}
                            onChange={() => updateMcqQuestion(qIndex, 'correct_option_id', option.option_id)}
                            className="w-4 h-4 text-primary"
                          />
                          <Input
                            placeholder={`Option ${option.option_id.toUpperCase()}`}
                            value={option.text}
                            onChange={(e) => updateMcqOption(qIndex, oIndex, e.target.value)}
                            containerClassName="flex-1"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-text-secondary mt-3">
                      Select the radio button next to the correct answer
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Coding Questions */}
        {(form.assessment_type === 'coding' || form.assessment_type === 'mixed') && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Coding Questions</h2>
              <Button type="button" variant="secondary" onClick={addCodingQuestion}>
                <Plus className="w-4 h-4" />
                Add Coding Question
              </Button>
            </div>

            {codingQuestions.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <Code className="w-12 h-12 mx-auto mb-4" />
                <p>No coding questions added yet. Click &quot;Add Coding Question&quot; to get started.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {codingQuestions.map((question, qIndex) => (
                  <div key={qIndex} className="p-4 bg-background rounded-xl">
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-sm font-medium text-primary">Coding Question {qIndex + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCodingQuestion(qIndex)}
                        className="text-error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-3">
                      <Input
                        label="Title"
                        placeholder="Question title"
                        value={question.title}
                        onChange={(e) => updateCodingQuestion(qIndex, 'title', e.target.value)}
                      />
                      <Textarea
                        label="Problem Statement"
                        placeholder="Describe the problem"
                        value={question.problem_statement}
                        onChange={(e) => updateCodingQuestion(qIndex, 'problem_statement', e.target.value)}
                        rows={3}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Textarea
                          label="Input Format"
                          placeholder="Describe input format"
                          value={question.input_format}
                          onChange={(e) => updateCodingQuestion(qIndex, 'input_format', e.target.value)}
                          rows={2}
                        />
                        <Textarea
                          label="Output Format"
                          placeholder="Describe output format"
                          value={question.output_format}
                          onChange={(e) => updateCodingQuestion(qIndex, 'output_format', e.target.value)}
                          rows={2}
                        />
                      </div>
                      <Textarea
                        label="Constraints"
                        placeholder="e.g., 1 <= n <= 1000"
                        value={question.constraints}
                        onChange={(e) => updateCodingQuestion(qIndex, 'constraints', e.target.value)}
                        rows={2}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Textarea
                          label="Sample Input"
                          placeholder="Sample input"
                          value={question.sample_input}
                          onChange={(e) => updateCodingQuestion(qIndex, 'sample_input', e.target.value)}
                          rows={2}
                        />
                        <Textarea
                          label="Sample Output"
                          placeholder="Expected output"
                          value={question.sample_output}
                          onChange={(e) => updateCodingQuestion(qIndex, 'sample_output', e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <Input
                          label="Marks"
                          type="number"
                          value={question.marks}
                          onChange={(e) => updateCodingQuestion(qIndex, 'marks', parseInt(e.target.value) || 1)}
                        />
                        <Select
                          label="Difficulty"
                          value={question.difficulty}
                          onChange={(e) => updateCodingQuestion(qIndex, 'difficulty', e.target.value)}
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </Select>
                        <Input
                          label="Time Limit (sec)"
                          type="number"
                          value={question.time_limit_seconds}
                          onChange={(e) => updateCodingQuestion(qIndex, 'time_limit_seconds', parseInt(e.target.value) || 2)}
                        />
                      </div>

                      {/* Test Cases */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-text-primary">Test Cases</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => addTestCase(qIndex)}>
                            <Plus className="w-3 h-3" /> Add
                          </Button>
                        </div>
                        {question.test_cases.map((tc, tcIndex) => (
                          <div key={tcIndex} className="p-3 bg-card rounded-xl mb-2 border border-border">
                            <div className="flex items-start justify-between mb-2">
                              <span className="text-xs text-text-secondary">Test Case {tcIndex + 1}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTestCase(qIndex, tcIndex)}
                                className="text-error"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <Textarea
                                placeholder="Input"
                                value={tc.input}
                                onChange={(e) => updateTestCase(qIndex, tcIndex, 'input', e.target.value)}
                                rows={2}
                              />
                              <Textarea
                                placeholder="Expected Output"
                                value={tc.expected_output}
                                onChange={(e) => updateTestCase(qIndex, tcIndex, 'expected_output', e.target.value)}
                                rows={2}
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-text-secondary">
                              <input
                                type="checkbox"
                                checked={tc.is_hidden}
                                onChange={(e) => updateTestCase(qIndex, tcIndex, 'is_hidden', e.target.checked)}
                                className="w-4 h-4 rounded"
                              />
                              Hidden test case
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <Button type="button" variant="secondary" onClick={() => navigate('/teacher')}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create Assessment
          </Button>
        </div>
      </form>
    </div>
  )
}
