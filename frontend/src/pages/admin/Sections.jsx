import { useEffect, useState } from 'react'
import { Layers, Plus } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { adminAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input, { Select } from '../../components/Input'
import Modal from '../../components/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/Table'
import { TableSkeleton } from '../../components/Loader'

export default function Sections() {
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sections, setSections] = useState([])
  const [departments, setDepartments] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', year: '', department_id: '' })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [sectionsRes, departmentsRes] = await Promise.all([
        adminAPI.getSections(token),
        adminAPI.getDepartments(token),
      ])
      setSections(Array.isArray(sectionsRes) ? sectionsRes : sectionsRes.sections || [])
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
      addToast('Please enter a section name', 'warning')
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
      await adminAPI.createSection(token, {
        name: form.name,
        year: parseInt(form.year),
        department_id: form.department_id,
      })
      addToast('Section created successfully', 'success')
      setShowModal(false)
      setForm({ name: '', year: '', department_id: '' })
      fetchData()
    } catch (error) {
      console.error('Failed to create section:', error)
      addToast(error.message || 'Failed to create section', 'error')
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
          <h1 className="text-2xl font-bold text-text-primary">Sections</h1>
          <p className="text-text-secondary mt-1">Manage class sections</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-5 h-5" />
          Add Section
        </Button>
      </div>

      {loading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : sections.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Layers className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No sections yet</h3>
            <p className="text-text-secondary mb-4">Create your first section to get started</p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-5 h-5" />
              Add Section
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
              {sections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell>
                    <span className="font-medium">{section.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">Year {section.year}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">
                      {getDepartmentName(section.department_id)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">
                      {section.created_at ? new Date(section.created_at).toLocaleDateString() : '-'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Section Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add Section"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Section Name"
            placeholder="e.g., Section A"
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
              Create Section
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
