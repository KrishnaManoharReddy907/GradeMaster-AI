import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import Card from './Card'

const statusConfig = {
  pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Pending' },
  evaluated: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Evaluated' },
  reviewed: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Reviewed' },
  finalized: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Finalized' },
  failed: { icon: XCircle, color: 'text-error', bg: 'bg-error/10', label: 'Failed' },
}

export default function SubmissionCard({
  title,
  studentName,
  status,
  aiScore,
  finalScore,
  submittedAt,
  onClick,
}) {
  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon

  return (
    <Card hover onClick={onClick} className="group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors">
            {title}
          </h3>
          {studentName && (
            <p className="text-sm text-text-secondary mt-0.5">{studentName}</p>
          )}
        </div>
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
          <Icon className="w-3.5 h-3.5" />
          {config.label}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        {aiScore !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary">AI Score:</span>
            <span className="font-medium text-primary">{aiScore}</span>
          </div>
        )}
        {finalScore !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary">Final:</span>
            <span className="font-medium text-success">{finalScore}</span>
          </div>
        )}
        {submittedAt && (
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(submittedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
