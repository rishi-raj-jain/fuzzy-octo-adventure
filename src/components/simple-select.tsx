'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'default',
  id,
}: {
  value: T
  onChange: (value: T) => void
  options: Record<T, string>
  className?: string
  size?: 'sm' | 'default'
  id?: string
}) {
  const items = (Object.entries(options) as [T, string][]).map(([v, label]) => ({ value: v, label }))
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger id={id} size={size} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
