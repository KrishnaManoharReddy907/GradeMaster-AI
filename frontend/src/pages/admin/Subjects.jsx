import { useEffect, useState } from 'react'
import { BookOpen, Plus } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { adminAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input, { Select } from '../../components/Input'
import Modal from '../../components/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/Table'
import { TableSkeleton } from '../../components/Loader'

export default function Subjects() {
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [departments, setDepartments] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    year: '',
    department_id: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [subjectsRes, departmentsRes] = await Promise.all([
        adminAPI.getSubjects(token),
        adminAPI.getDepartments(token),
      ])
      setSubjects(Array.isArray(subjectsRes) ? subjectsRes : subjectsRes.subjects || [])
      setDepartments(Array.isArray(departmentsRes) ? departmentsRes : departmentsRes.departments || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
      addToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) {
      addToast('Please enter a subject name', 'warning')
      return
    }
    if (!form.year) {
      addToast('Please select a year', 'warning')
      return
    }
    if (!form.department_id) {
      addToast('Please select a department', 'warning')
      return
    }

    setSubmitting(true)
    try {
      await adminAPI.createSubject(token, {
        name: form.name,
        year: parseInt(form.year),
        department_id: form.department_id,
      })
      addToast('Subject created successfully', 'success')
      setShowModal(false)
      setForm({ name: '', year: '', department_id: '' })
      fetchData()
    } catch (error) {
      console.error('Failed to create subject:', error)
      addToast(error.message || 'Failed to create subject', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const getDepartmentName = (deptId) => {
    const dept = departments.find(d => d.id === deptId)
    return dept?.name || '-'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Subjects</h1>
          <p className="text-text-secondary mt-1">Manage academic subjects</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-5 h-5" />
          Add Subject
        </Button>
      </div>

      {loading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : subjects.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No subjects yet</h3>
            <p className="text-text-secondary mb-4">Create your first subject to get started</p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-5 h-5" />
              Add Subject
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((subject) => (
                <TableRow key={subject.id}>
                  <TableCell>
                    <span className="font-medium">{subject.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">Year {subject.year}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">
                      {getDepartmentName(subject.department_id)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">
                      {subject.created_at ? new Date(subject.created_at).toLocaleDateString() : '-'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Subject Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add Subject"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Subject Name"
            placeholder="e.g., Data Structures"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label="Year"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
          >
            <option value="">Select year</option>
            <option value="1">1st Year</option>
            <option value="2">2nd Year</option>
            <option value="3">3rd Year</option>
            <option value="4">4th Year</option>
          </Select>
          <Select
            label="Department"
            value={form.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          >
            <option value="">Select a department</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Subject
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
