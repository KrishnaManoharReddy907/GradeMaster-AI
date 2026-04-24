import { useEffect, useState } from 'react'
import { User, Clock, CheckCircle, XCircle } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { adminAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/Table'
import Badge from '../../components/Badge'
import { TableSkeleton } from '../../components/Loader'

export default function PendingUsers() {
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState({})
  const [pendingUsers, setPendingUsers] = useState([])

  useEffect(() => {
    fetchPendingUsers()
  }, [])

  const fetchPendingUsers = async () => {
    try {
      const response = await adminAPI.getPendingUsers(token)
      const list = Array.isArray(response) ? response : response.users || []
      setPendingUsers(list)
    } catch (error) {
      console.error('[v0] Failed to fetch pending users:', error)
      addToast('Failed to load pending users', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId) => {
    setApproving(prev => ({ ...prev, [userId]: true }))
    try {
      await adminAPI.approveUser(token, userId)
      addToast('User approved successfully', 'success')
      fetchPendingUsers()
    } catch (error) {
      console.error('[v0] Failed to approve user:', error)
      addToast(error.message || 'Failed to approve user', 'error')
    } finally {
      setApproving(prev => ({ ...prev, [userId]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Pending Users</h1>
        <p className="text-text-secondary mt-1">Approve or reject pending teacher registrations</p>
      </div>

      {loading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : pendingUsers.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">All caught up!</h3>
            <p className="text-text-secondary">No pending user approvals at the moment.</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-warning/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-warning" />
                      </div>
                      <span className="font-medium">{user.name || 'User'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary">{user.email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning" className="capitalize">
                      {user.role || 'teacher'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Clock className="w-4 h-4" />
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleApprove(user.id)}
                        loading={approving[user.id]}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
