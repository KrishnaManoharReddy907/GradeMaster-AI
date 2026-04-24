import { clsx } from 'clsx'

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
}

export default function Loader({ size = 'md', className }) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-primary border-t-transparent',
        sizes[size],
        className
      )}
    />
  )
}

export function Skeleton({ className }) {
  return (
    <div
      className={clsx(
        'bg-card animate-skeleton rounded-xl',
        className
      )}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <Skeleton className="h-6 w-3/4 mb-3" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-2/3 mb-4" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
