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
        <label className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <input
        className={twMerge(clsx(
          'w-full px-4 py-2.5 rounded-xl bg-card border border-border',
          'text-text-primary placeholder:text-text-secondary',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
          'transition-all duration-200',
          error && 'border-error focus:ring-error/50 focus:border-error',
          className
        ))}
        {...props}
      />
      {error && (
        <span className="text-sm text-error">{error}</span>
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
        <label className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <select
        className={twMerge(clsx(
          'w-full px-4 py-2.5 rounded-xl bg-card border border-border',
          'text-text-primary',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
          'transition-all duration-200',
          error && 'border-error focus:ring-error/50 focus:border-error',
          className
        ))}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span className="text-sm text-error">{error}</span>
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
        <label className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <textarea
        className={twMerge(clsx(
          'w-full px-4 py-2.5 rounded-xl bg-card border border-border',
          'text-text-primary placeholder:text-text-secondary',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
          'transition-all duration-200 resize-none',
          error && 'border-error focus:ring-error/50 focus:border-error',
          className
        ))}
        {...props}
      />
      {error && (
        <span className="text-sm text-error">{error}</span>
      )}
    </div>
  )
}
