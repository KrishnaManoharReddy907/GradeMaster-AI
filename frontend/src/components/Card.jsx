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
        'glass-card rounded-2xl p-6 transition-all duration-300',
        hover && 'hover-lift glow-hover cursor-pointer',
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
    <h3 className={twMerge('text-lg font-semibold text-text-primary tracking-tight', className)}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className }) {
  return (
    <p className={twMerge('text-sm text-text-secondary mt-1 leading-relaxed', className)}>
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
    <div className={twMerge('mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-2', className)}>
      {children}
    </div>
  )
}
