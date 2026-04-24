import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export default function Table({ children, className }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className={twMerge('w-full', className)}>
        {children}
      </table>
    </div>
  )
}

export function TableHeader({ children, className }) {
  return (
    <thead className={twMerge('bg-card/50', className)}>
      {children}
    </thead>
  )
}

export function TableBody({ children, className }) {
  return (
    <tbody className={twMerge('divide-y divide-border', className)}>
      {children}
    </tbody>
  )
}

export function TableRow({ children, className, onClick }) {
  return (
    <tr
      onClick={onClick}
      className={twMerge(clsx(
        'bg-card hover:bg-card/80 transition-colors',
        onClick && 'cursor-pointer',
        className
      ))}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children, className }) {
  return (
    <th className={twMerge(
      'px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider',
      className
    )}>
      {children}
    </th>
  )
}

export function TableCell({ children, className }) {
  return (
    <td className={twMerge('px-4 py-3 text-sm text-text-primary', className)}>
      {children}
    </td>
  )
}
