import { useEffect, useState } from 'react'
import { UserPlus, User } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { adminAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input, { Select } from '../../components/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/Table'
import Badge from '../../components/Badge'
import { TableSkeleton } from '../../components/Loader'

export default function AssignTeacher() {
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [assignments, setAssignments] = useState([])
  const [subjects, setSubjects] = useState([])
  const [sections, setSections] = useState([])
  const [teachers, setTeachers] = useState([])
  const [form, setForm] = useState({
    teacher_id: '',
    subject_id: '',
    section_ids: [],
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [assignmentsRes, subjectsRes, sectionsRes, teachersRes] = await Promise.all([
        adminAPI.getTeacherAssignments(token),
        adminAPI.getSubjects(token),
        adminAPI.getSections(token),
        adminAPI.getApprovedTeachers(token).catch(() => []),
      ])
      setAssignments(Array.isArray(assignmentsRes) ? assignmentsRes : assignmentsRes.assignments || [])
      setSubjects(Array.isArray(subjectsRes) ? subjectsRes : subjectsRes.subjects || [])
      setSections(Array.isArray(sectionsRes) ? sectionsRes : sectionsRes.sections || [])
      setTeachers(Array.isArray(teachersRes) ? teachersRes : [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
      addToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSectionToggle = (sectionId) => {
    setForm(prev => ({
      ...prev,
      section_ids: prev.section_ids.includes(sectionId)
        ? prev.section_ids.filter(id => id !== sectionId)
        : [...prev.section_ids, sectionId]
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.teacher_id) {
      addToast('Please enter a teacher ID', 'warning')
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

    setSubmitting(true)
    try {
      await adminAPI.assignTeacher(token, {
        teacher_id: form.teacher_id,
        subject_id: form.subject_id,
        section_ids: form.section_ids,
      })
      addToast('Teacher assigned successfully', 'success')
      setForm({ teacher_id: '', subject_id: '', section_ids: [] })
      fetchData()
    } catch (error) {
      console.error('Failed to assign teacher:', error)
      addToast(error.message || 'Failed to assign teacher', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const getSubjectName = (subjectId) => {
    const subject = subjects.find(s => s.id === subjectId)
    return subject?.name || subjectId
  }

  const getTeacherName = (teacherId) => {
    const teacher = teachers.find(t => t.id === teacherId)
    return teacher ? `${teacher.name} (${teacher.email})` : teacherId
  }

  const getSectionNames = (sectionIds) => {
    if (!Array.isArray(sectionIds)) return '-'
    return sectionIds.map(id => {
      const section = sections.find(s => s.id === id)
      return section?.name || id
    }).join(', ')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Assign Teacher</h1>
        <p className="text-text-secondary mt-1">Assign teachers to subjects and sections</p>
      </div>

      {/* Assignment Form */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">New Assignment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Teacher"
            value={form.teacher_id}
            onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
          >
            <option value="">Select a teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name} — {teacher.email}
              </option>
            ))}
          </Select>
          {teachers.length === 0 && (
            <p className="text-sm text-warning">No approved teachers found. Approve a teacher first.</p>
          )}
          <Select
            label="Subject"
            value={form.subject_id}
            onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
          >
            <option value="">Select a subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
          
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
                  <span className="text-sm">{section.name} (Year {section.year})</span>
                </label>
              ))}
            </div>
            {sections.length === 0 && (
              <p className="text-sm text-text-secondary">No sections available. Create sections first.</p>
            )}
          </div>

          <Button type="submit" loading={submitting}>
            <UserPlus className="w-5 h-5" />
            Assign Teacher
          </Button>
        </form>
      </Card>

      {/* Current Assignments */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Current Assignments</h2>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : assignments.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            <User className="w-12 h-12 mx-auto mb-4" />
            <p>No teacher assignments yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher ID</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sections</TableHead>
                  <TableHead>Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment, index) => (
                  <TableRow key={assignment.id || index}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium">{getTeacherName(assignment.teacher_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="primary">{getSubjectName(assignment.subject_id)}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary">
                        {getSectionNames(assignment.section_ids)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary">
                        {assignment.created_at ? new Date(assignment.created_at).toLocaleDateString() : '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
