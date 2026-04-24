import { useState } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export default function Tabs({ tabs, defaultTab, className }) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)
  const activeContent = tabs.find(tab => tab.id === activeTab)?.content

  return (
    <div className={twMerge('', className)}>
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200',
              'border-b-2 -mb-px',
              activeTab === tab.id
                ? 'text-primary border-primary'
                : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {activeContent}
      </div>
    </div>
  )
}

export function TabsControlled({ tabs, activeTab, onTabChange, className }) {
  const activeContent = tabs.find(tab => tab.id === activeTab)?.content

  return (
    <div className={twMerge('', className)}>
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200',
              'border-b-2 -mb-px',
              activeTab === tab.id
                ? 'text-primary border-primary'
                : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {activeContent}
      </div>
    </div>
  )
}
