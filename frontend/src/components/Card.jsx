import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export default function Card({
  children,
  className,
  hover = false,
  ...props
}) {
  return (
    <div
      className={twMerge(clsx(
        'bg-card rounded-xl border border-border p-6',
        hover && 'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer',
        className
      ))}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }) {
  return (
    <div className={twMerge('mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={twMerge('text-lg font-semibold text-text-primary', className)}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className }) {
  return (
    <p className={twMerge('text-sm text-text-secondary mt-1', className)}>
      {children}
    </p>
  )
}

export function CardContent({ children, className }) {
  return (
    <div className={twMerge('', className)}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className }) {
  return (
    <div className={twMerge('mt-4 pt-4 border-t border-border flex items-center gap-2', className)}>
      {children}
    </div>
  )
}
