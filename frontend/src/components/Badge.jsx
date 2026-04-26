import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const variants = {
  default: 'bg-white/[0.06] text-text-secondary border border-white/[0.08]',
  primary: 'bg-primary/10 text-primary border border-primary/15',
  success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
  error: 'bg-red-500/10 text-red-400 border border-red-500/15',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/15',
}

export default function Badge({ children, variant = 'default', className }) {
  return (
    <span
      className={twMerge(clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium tracking-wide',
        variants[variant],
        className
      ))}
    >
      {children}
    </span>
  )
}
