import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const variants = {
  default: 'bg-card text-text-primary border border-border',
  primary: 'bg-primary/20 text-primary',
  success: 'bg-success/20 text-success',
  error: 'bg-error/20 text-error',
  warning: 'bg-warning/20 text-warning',
}

export default function Badge({ children, variant = 'default', className }) {
  return (
    <span
      className={twMerge(clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      ))}
    >
      {children}
    </span>
  )
}
