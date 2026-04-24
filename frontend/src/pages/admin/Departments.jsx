import { useEffect, useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { adminAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Modal from '../../components/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/Table'
import { TableSkeleton } from '../../components/Loader'

export default function Departments() {
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [departments, setDepartments] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '' })

  useEffect(() => {
    fetchDepartments()
  }, [])

  const fetchDepartments = async () => {
    try {
      const response = await adminAPI.getDepartments(token)
      const list = Array.isArray(response) ? response : response.departments || []
      setDepartments(list)
    } catch (error) {
      console.error('Failed to fetch departments:', error)
      addToast('Failed to load departments', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) {
      addToast('Please enter a department name', 'warning')
      return
    }

    setSubmitting(true)
    try {
      await adminAPI.createDepartment(token, { name: form.name })
      addToast('Department created successfully', 'success')
      setShowModal(false)
      setForm({ name: '' })
      fetchDepartments()
    } catch (error) {
      console.error('Failed to create department:', error)
      addToast(error.message || 'Failed to create department', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Departments</h1>
          <p className="text-text-secondary mt-1">Manage academic departments</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-5 h-5" />
          Add Department
        </Button>
      </div>

      {loading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : departments.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No departments yet</h3>
            <p className="text-text-secondary mb-4">Create your first department to get started</p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-5 h-5" />
              Add Department
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell>
                    <span className="font-medium">{dept.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">
                      {dept.created_at ? new Date(dept.created_at).toLocaleDateString() : '-'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Department Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add Department"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Department Name"
            placeholder="e.g., Computer Science"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Department
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
