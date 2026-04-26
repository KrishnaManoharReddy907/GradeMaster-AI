import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export default function Input({
  label,
  error,
  className,
  containerClassName,
  ...props
}) {
  return (
    <div className={twMerge('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label className="text-sm font-medium text-text-primary tracking-tight">
          {label}
        </label>
      )}
      <input
        className={twMerge(clsx(
          'w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]',
          'text-text-primary placeholder:text-text-muted text-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
          'transition-all duration-200',
          'hover:border-white/[0.15]',
          error && 'border-error/50 focus:ring-error/30 focus:border-error/50',
          className
        ))}
        {...props}
      />
      {error && (
        <span className="text-xs text-error">{error}</span>
      )}
    </div>
  )
}

export function Select({
  label,
  error,
  className,
  containerClassName,
  children,
  ...props
}) {
  return (
    <div className={twMerge('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label className="text-sm font-medium text-text-primary tracking-tight">
          {label}
        </label>
      )}
      <select
        className={twMerge(clsx(
          'w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]',
          'text-text-primary text-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
          'transition-all duration-200',
          'hover:border-white/[0.15]',
          error && 'border-error/50 focus:ring-error/30 focus:border-error/50',
          className
        ))}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span className="text-xs text-error">{error}</span>
      )}
    </div>
  )
}

export function Textarea({
  label,
  error,
  className,
  containerClassName,
  ...props
}) {
  return (
    <div className={twMerge('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label className="text-sm font-medium text-text-primary tracking-tight">
          {label}
        </label>
      )}
      <textarea
        className={twMerge(clsx(
          'w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]',
          'text-text-primary placeholder:text-text-muted text-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
          'transition-all duration-200 resize-none',
          'hover:border-white/[0.15]',
          error && 'border-error/50 focus:ring-error/30 focus:border-error/50',
          className
        ))}
        {...props}
      />
      {error && (
        <span className="text-xs text-error">{error}</span>
      )}
    </div>
  )
}
