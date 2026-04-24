import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { clsx } from 'clsx'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles = {
  success: 'bg-success/10 border-success/30 text-success',
  error: 'bg-error/10 border-error/30 text-error',
  warning: 'bg-warning/10 border-warning/30 text-warning',
  info: 'bg-primary/10 border-primary/30 text-primary',
}

export default function Toast({ message, type = 'info', onClose }) {
  const Icon = icons[type]

  return (
    <div
      className={clsx(
        'toast-enter flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm',
        'min-w-[300px] max-w-[400px] shadow-lg',
        styles[type]
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1 text-sm font-medium text-text-primary">{message}</span>
      <button
        onClick={onClose}
        className="p-1 hover:bg-white/10 rounded-lg transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
