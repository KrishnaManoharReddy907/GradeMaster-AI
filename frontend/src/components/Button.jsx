import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const variants = {
  primary: 'bg-primary hover:bg-primary/90 text-white',
  secondary: 'bg-card hover:bg-card/80 text-text-primary border border-border',
  success: 'bg-success hover:bg-success/90 text-white',
  danger: 'bg-error hover:bg-error/90 text-white',
  warning: 'bg-warning hover:bg-warning/90 text-white',
  ghost: 'hover:bg-card text-text-primary',
  outline: 'border border-border hover:bg-card text-text-primary',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  loading,
  ...props
}) {
  return (
    <button
      className={twMerge(clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      ))}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  )
}
