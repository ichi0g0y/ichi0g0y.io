import { ChevronDownIcon } from '@radix-ui/react-icons'
import { Command } from 'cmdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type CategoryCommandFieldProps = {
  value: string
  options: string[]
  onValueChange: (nextValue: string) => void
  placeholder?: string
}

export function CategoryCommandField({ value, options, onValueChange, placeholder }: CategoryCommandFieldProps) {
  const normalizedOptions = useMemo(
    () => Array.from(new Set(options.map((option) => option.trim()).filter((option) => option.length > 0))),
    [options],
  )
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const suppressOpenOnFocusRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleSelectCategory = useCallback(
    (category: string) => {
      suppressOpenOnFocusRef.current = true
      onValueChange(category)
      setIsOpen(false)
      inputRef.current?.blur()
      window.setTimeout(() => {
        suppressOpenOnFocusRef.current = false
      }, 0)
    },
    [onValueChange],
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (!rootRef.current) {
        return
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  return (
    <div ref={rootRef} className={`category-combobox${isOpen ? ' is-open' : ''}`}>
      <Command className="category-command" shouldFilter={false}>
        <div className="category-command-control">
          <Command.Input
            ref={inputRef}
            className="category-command-input"
            value={value}
            onValueChange={onValueChange}
            onFocus={() => {
              if (suppressOpenOnFocusRef.current) {
                return
              }
              setIsOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsOpen(false)
              }
              if (event.key === 'ArrowDown' && !isOpen) {
                setIsOpen(true)
              }
            }}
            placeholder={placeholder ?? 'カテゴリを入力'}
          />
          <button
            className="category-command-trigger"
            type="button"
            aria-label="カテゴリ候補を開く"
            onClick={() => {
              setIsOpen((prev) => !prev)
              if (!isOpen) {
                inputRef.current?.focus()
              }
            }}
          >
            <ChevronDownIcon />
          </button>
        </div>

        {isOpen ? (
          <Command.List className="category-command-list">
            <Command.Empty className="category-command-empty">候補がありません</Command.Empty>
            {normalizedOptions.map((category) => (
              <Command.Item
                key={category}
                value={category}
                className="category-command-item"
                onSelect={() => handleSelectCategory(category)}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => handleSelectCategory(category)}
              >
                {category}
              </Command.Item>
            ))}
          </Command.List>
        ) : null}
      </Command>
    </div>
  )
}
