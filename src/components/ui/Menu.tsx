import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
  separatorBefore?: boolean
}

interface MenuProps {
  items: MenuItem[]
  label?: string
  align?: 'left' | 'right'
  className?: string
}

const MENU_WIDTH = 208
const VIEWPORT_GUTTER = 8

export function Menu({ items, label = 'Actions', align = 'right', className }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onViewportChange = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const estimatedHeight = Math.min(items.length * 44 + 24, window.innerHeight - VIEWPORT_GUTTER * 2)
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpwards = spaceBelow < estimatedHeight && rect.top > spaceBelow

      const preferredLeft = align === 'right' ? rect.right - MENU_WIDTH : rect.left
      const left = Math.min(
        Math.max(VIEWPORT_GUTTER, preferredLeft),
        window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER,
      )
      const preferredTop = openUpwards ? rect.top - estimatedHeight - 4 : rect.bottom + 4
      const top = Math.min(
        Math.max(VIEWPORT_GUTTER, preferredTop),
        window.innerHeight - estimatedHeight - VIEWPORT_GUTTER,
      )

      setPosition({ top, left })
    }
    setOpen((value) => !value)
  }

  return (
    <div ref={containerRef} className={cn('relative inline-flex', open && 'z-50', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleToggle}
        className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-white sm:h-9 sm:w-9"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: MENU_WIDTH,
                maxHeight: `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`,
              }}
              className={cn(
                'z-[60] overflow-y-auto overscroll-contain rounded-xl border border-ink-100 bg-white py-1 shadow-xl animate-fade-in motion-reduce:animate-none',
                'dark:border-ink-800 dark:bg-ink-900',
              )}
            >
              {items.map((item, index) => (
                <div key={`${item.label}-${index}`}>
                  {item.separatorBefore ? (
                    <div className="my-1 border-t border-ink-100 dark:border-ink-800" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpen(false)
                      item.onSelect()
                    }}
                    className={cn(
                      'flex w-full touch-manipulation items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40',
                      item.tone === 'danger'
                        ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
                        : 'text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800',
                    )}
                  >
                    {item.icon ? (
                      <span className="flex h-4 w-4 items-center justify-center">{item.icon}</span>
                    ) : null}
                    {item.label}
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
