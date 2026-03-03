import { ChevronDownIcon, Cross2Icon, EyeOpenIcon, Pencil2Icon, PlusIcon } from '@radix-ui/react-icons'
import { Command } from 'cmdk'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'

const links = [
  {
    label: 'GitHub',
    href: 'https://github.com/ichi0g0y',
    icon: '/icons/github.png',
  },
  {
    label: 'Twitter',
    href: 'https://x.com/ichi0g0y',
    icon: '/icons/twitter.svg',
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/Y4SGjwauNS',
    icon: '/icons/discord.svg',
  },
  {
    label: 'Dropbox',
    href: 'https://www.dropbox.com/scl/fo/w38k8gn54kp681gv1nc8b/ADf0yoRtRXCLhwLOOZuhWp0?rlkey=eutco8gaj0zlkcg9iaqzlciqa&dl=0',
    icon: '/icons/dropbox.svg',
  },
] as const

type GearItem = {
  id: number
  title: string
  category: string
  imageUrl: string | null
  imageFit: 'cover' | 'contain'
  linkUrl: string | null
  description: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

type LoginStep = 'email' | 'code'
type ToastTone = 'success' | 'error' | 'info'
type AddDialogStep = 'url' | 'edit'

type ToastState = {
  id: number
  message: string
  tone: ToastTone
}

const fallbackGearItems: GearItem[] = [
  {
    id: 1,
    title: 'Ryzen 9 7950X3D',
    category: 'ゲーミングPC',
    imageUrl: '/gear/gaming-pc.jpg',
    imageFit: 'cover',
    linkUrl: null,
    description: null,
    sortOrder: 10,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 2,
    title: 'ASUS RTX4070ti Super',
    category: 'ゲーミングPC',
    imageUrl: '/gear/gaming-pc.jpg',
    imageFit: 'cover',
    linkUrl: null,
    description: null,
    sortOrder: 20,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 3,
    title: 'DDR5 64GB',
    category: 'ゲーミングPC',
    imageUrl: '/gear/gaming-pc.jpg',
    imageFit: 'cover',
    linkUrl: null,
    description: null,
    sortOrder: 30,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 4,
    title: 'Mac Strudio M4 Max 64GB',
    category: '配信機材',
    imageUrl: '/gear/stream-audio.jpg',
    imageFit: 'cover',
    linkUrl: null,
    description: null,
    sortOrder: 40,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 5,
    title: 'BabyFace Pro fs',
    category: '配信機材',
    imageUrl: '/gear/stream-audio.jpg',
    imageFit: 'cover',
    linkUrl: null,
    description: null,
    sortOrder: 50,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 6,
    title: 'SM7B',
    category: '配信機材',
    imageUrl: '/gear/stream-audio.jpg',
    imageFit: 'cover',
    linkUrl: null,
    description: null,
    sortOrder: 60,
    createdAt: 0,
    updatedAt: 0,
  },
]

const TYPE_START_DELAY_MS = 360
const BASE_TYPE_SPEED_MS = 24
const TYPE_SPEED_RANDOM_MS = 42
const PUNCTUATION_PAUSE_MS = 130
const HIDDEN_TAP_TARGET = 5
const HIDDEN_TAP_WINDOW_MS = 1800
const TWITCH_CHANNEL = 'ichi0g0y'
// 手動切り替え: 配信中なら true、オフラインなら false
const IS_LIVE = true

function getGreetingByHour(date: Date) {
  const hour = date.getHours()

  if (hour >= 4 && hour < 11) {
    return 'おはようございます'
  }

  if (hour >= 11 && hour < 18) {
    return 'こんにちは'
  }

  return 'こんばんは'
}

function createIntroMessage() {
  const greeting = getGreetingByHour(new Date())

  return `${greeting}、\n\nICH (いち) ともうします。\n\n兵庫在住のライトプログラマー。GitHubではバイブコーディングを中心に制作し、Twitchでは作業雑談やレトロゲーム機の改造配信、各種ゲーム配信を不定期で行っています。\n\nゆるく作って、だらだら遊ぶのが好きです。気になったら気軽に声をかけてください。`
}

function normalizeImageFit(value: unknown): GearItem['imageFit'] {
  return value === 'cover' ? 'cover' : 'contain'
}

function normalizeGearItem(item: GearItem): GearItem {
  return {
    ...item,
    imageFit: normalizeImageFit(item.imageFit),
  }
}

type ImageFitSwitchProps = {
  checked: boolean
  onCheckedChange: (nextChecked: boolean) => void
}

function ImageFitSwitch({ checked, onCheckedChange }: ImageFitSwitchProps) {
  return (
    <button
      className={`image-fit-switch${checked ? ' is-on' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="image-fit-switch-thumb" aria-hidden="true" />
    </button>
  )
}

type CategoryCommandFieldProps = {
  value: string
  options: string[]
  onValueChange: (nextValue: string) => void
  placeholder?: string
}

function CategoryCommandField({ value, options, onValueChange, placeholder }: CategoryCommandFieldProps) {
  const normalizedOptions = useMemo(
    () => Array.from(new Set(options.map((option) => option.trim()).filter((option) => option.length > 0))),
    [options],
  )
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
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
            onFocus={() => setIsOpen(true)}
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
                onSelect={() => {
                  onValueChange(category)
                  setIsOpen(false)
                }}
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

function App() {
  const introChars = useMemo(() => Array.from(createIntroMessage()), [])
  const twitchChannelUrl = `https://www.twitch.tv/${TWITCH_CHANNEL}`
  const twitchEmbedSrc = useMemo(() => {
    const parent = window.location.hostname || 'localhost'
    return `https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&parent=${parent}&muted=true`
  }, [])
  const [typedChars, setTypedChars] = useState<string[]>([])
  const [gearItems, setGearItems] = useState<GearItem[]>(fallbackGearItems)
  const [isGearLoading, setIsGearLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
  const [loginStep, setLoginStep] = useState<LoginStep>('email')
  const [authMessage, setAuthMessage] = useState('')
  const [devAuthCode, setDevAuthCode] = useState<string | null>(null)
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isEditMode, setIsEditMode] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [newGearUrl, setNewGearUrl] = useState('')
  const [newGearTitle, setNewGearTitle] = useState('')
  const [newGearDescription, setNewGearDescription] = useState('')
  const [newGearCategory, setNewGearCategory] = useState('')
  const [newGearImageFit, setNewGearImageFit] = useState<GearItem['imageFit']>('contain')
  const [addDialogStep, setAddDialogStep] = useState<AddDialogStep>('url')
  const [isFetchingPreview, setIsFetchingPreview] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [deletingGearId, setDeletingGearId] = useState<number | null>(null)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<GearItem | null>(null)
  const [draggingGearId, setDraggingGearId] = useState<number | null>(null)
  const [dragOverGearId, setDragOverGearId] = useState<number | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [editingGearId, setEditingGearId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editImageFit, setEditImageFit] = useState<GearItem['imageFit']>('contain')
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [toast, setToast] = useState<ToastState | null>(null)
  const tapStateRef = useRef({ count: 0, lastTappedAt: 0 })
  const isAdminEditing = Boolean(accessToken && isEditMode)
  const isModeToggleLocked = isAdding || isFetchingPreview || isUpdating || deletingGearId !== null

  const sortGearItems = useCallback((items: GearItem[]) => {
    return [...items].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder
      }
      return left.id - right.id
    })
  }, [])

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(gearItems.map((item) => item.category.trim()).filter((category) => category.length > 0)))
  }, [gearItems])

  const filteredGearItems = useMemo(() => {
    if (selectedCategory === 'all') {
      return gearItems
    }
    return gearItems.filter((item) => item.category === selectedCategory)
  }, [gearItems, selectedCategory])

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: Date.now(), message, tone })
  }, [])

  const parseApiResponse = useCallback(async (response: Response) => {
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const message = (data as { message?: string } | null)?.message ?? 'APIリクエストに失敗しました'
      throw new Error(message)
    }
    return data as Record<string, unknown>
  }, [])

  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await parseApiResponse(response)
      const token = (data.accessToken as string | undefined) ?? null
      const email = (data.email as string | undefined) ?? null
      if (!token || !email) {
        return null
      }
      setAccessToken(token)
      setAdminEmail(email)
      return token
    } catch {
      setAccessToken(null)
      setAdminEmail(null)
      return null
    }
  }, [parseApiResponse])

  const loadGearItems = useCallback(async () => {
    setIsGearLoading(true)
    try {
      const response = await fetch('/api/gear-items')
      const data = await parseApiResponse(response)
      const items = Array.isArray(data.items) ? (data.items as GearItem[]) : []
      if (items.length > 0) {
        setGearItems(sortGearItems(items.map(normalizeGearItem)))
      }
    } catch {
      setGearItems(sortGearItems(fallbackGearItems))
    } finally {
      setIsGearLoading(false)
    }
  }, [parseApiResponse, sortGearItems])

  useEffect(() => {
    let nextTypeTimer: ReturnType<typeof setTimeout> | null = null

    const typeStartTimer = setTimeout(() => {
      let index = 0

      const typeNext = () => {
        const nextChar = introChars[index]
        setTypedChars((previous) => [...previous, nextChar])
        index += 1

        if (index >= introChars.length) {
          return
        }

        const isPunctuation = /[、。,.!?]/.test(nextChar)
        const jitter = Math.floor(Math.random() * TYPE_SPEED_RANDOM_MS)
        const delay = BASE_TYPE_SPEED_MS + jitter + (isPunctuation ? PUNCTUATION_PAUSE_MS : 0)
        nextTypeTimer = setTimeout(typeNext, delay)
      }

      typeNext()
    }, TYPE_START_DELAY_MS)

    return () => {
      clearTimeout(typeStartTimer)
      if (nextTypeTimer) {
        clearTimeout(nextTypeTimer)
      }
    }
  }, [introChars])

  useEffect(() => {
    void loadGearItems()
    void refreshAccessToken()
  }, [loadGearItems, refreshAccessToken])

  useEffect(() => {
    if (selectedCategory === 'all') {
      return
    }
    if (!categoryOptions.includes(selectedCategory)) {
      setSelectedCategory('all')
    }
  }, [categoryOptions, selectedCategory])

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current))
    }, 2800)
    return () => {
      clearTimeout(timer)
    }
  }, [toast])

  const isTypingDone = typedChars.length >= introChars.length

  const requestWithAuth = useCallback(
    async (path: string, init: RequestInit) => {
      let token = accessToken
      if (!token) {
        token = await refreshAccessToken()
      }
      if (!token) {
        throw new Error('ログインが必要です')
      }

      const execute = async (authToken: string) => {
        const headers = new Headers(init.headers)
        headers.set('Authorization', `Bearer ${authToken}`)
        const response = await fetch(path, {
          ...init,
          headers,
          credentials: 'include',
        })
        return response
      }

      let response = await execute(token)
      if (response.status === 401) {
        const refreshedToken = await refreshAccessToken()
        if (!refreshedToken) {
          throw new Error('ログインの有効期限が切れました')
        }
        response = await execute(refreshedToken)
      }

      return parseApiResponse(response)
    },
    [accessToken, parseApiResponse, refreshAccessToken],
  )

  const handleHiddenTrigger = useCallback(() => {
    const now = Date.now()
    const tapState = tapStateRef.current
    if (now - tapState.lastTappedAt > HIDDEN_TAP_WINDOW_MS) {
      tapState.count = 0
    }
    tapState.count += 1
    tapState.lastTappedAt = now

    if (tapState.count >= HIDDEN_TAP_TARGET) {
      tapState.count = 0
      setIsAuthDialogOpen(true)
      if (!accessToken) {
        setLoginStep('email')
      }
      setAuthMessage('')
      setDevAuthCode(null)
    }
  }, [accessToken])

  const handleCloseAuthDialog = useCallback(() => {
    if (isAuthBusy) {
      return
    }
    setIsAuthDialogOpen(false)
    setAuthMessage('')
  }, [isAuthBusy])

  const handleRequestCode = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setIsAuthBusy(true)
      setAuthMessage('')
      setDevAuthCode(null)

      try {
        const response = await fetch('/api/auth/request-code', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail.trim() }),
        })
        const data = await parseApiResponse(response)
        setDevAuthCode((data.devCode as string | undefined) ?? null)
        setLoginStep('code')
        setLoginCode('')
        setAuthMessage('認証コードを送信しました。コード入力待ちです。')
      } catch (error) {
        const message = error instanceof Error ? error.message : '認証コード発行に失敗しました'
        setAuthMessage(message)
      } finally {
        setIsAuthBusy(false)
      }
    },
    [loginEmail, parseApiResponse],
  )

  const handleVerifyCode = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setIsAuthBusy(true)
      setAuthMessage('')

      try {
        const response = await fetch('/api/auth/verify-code', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: loginEmail.trim(),
            code: loginCode.trim(),
          }),
        })
        const data = await parseApiResponse(response)
        const token = (data.accessToken as string | undefined) ?? null
        const email = (data.email as string | undefined) ?? null
        if (!token || !email) {
          throw new Error('ログインに失敗しました')
        }
        setAccessToken(token)
        setAdminEmail(email)
        setLoginCode('')
        setAuthMessage('')
        setIsAuthDialogOpen(false)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ログインに失敗しました'
        setAuthMessage(message)
      } finally {
        setIsAuthBusy(false)
      }
    },
    [loginCode, loginEmail, parseApiResponse],
  )

  const handleLogout = useCallback(async () => {
    setIsAuthBusy(true)
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      setAccessToken(null)
      setAdminEmail(null)
      setIsEditMode(true)
      setIsAddFormOpen(false)
      setNewGearUrl('')
      setNewGearTitle('')
      setNewGearDescription('')
      setNewGearCategory('')
      setNewGearImageFit('contain')
      setAddDialogStep('url')
      setIsFetchingPreview(false)
      setEditingGearId(null)
      setDeleteConfirmTarget(null)
      setEditTitle('')
      setEditDescription('')
      setEditCategory('')
      setEditImageFit('contain')
      setSelectedCategory('all')
      setLoginStep('email')
      setLoginCode('')
      setAuthMessage('ログアウトしました。')
      setToast(null)
    } finally {
      setIsAuthBusy(false)
    }
  }, [])

  const openEditGearItem = useCallback((item: GearItem) => {
    setEditingGearId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
    setEditCategory(item.category)
    setEditImageFit(item.imageFit)
    setIsAddFormOpen(false)
  }, [])

  const handleOpenAddDialog = useCallback(() => {
    setNewGearUrl('')
    setNewGearTitle('')
    setNewGearDescription('')
    setNewGearCategory('')
    setNewGearImageFit('contain')
    setAddDialogStep('url')
    setIsAddFormOpen(true)
  }, [])

  const handleCloseAddDialog = useCallback(() => {
    if (isAdding || isFetchingPreview) {
      return
    }
    setIsAddFormOpen(false)
    setAddDialogStep('url')
  }, [isAdding, isFetchingPreview])

  const handleLoadPreviewForAddDialog = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const targetUrl = newGearUrl.trim()
      if (!targetUrl) {
        showToast('URLを入力してください', 'error')
        return
      }

      setIsFetchingPreview(true)
      try {
        const response = await fetch(`/api/preview?url=${encodeURIComponent(targetUrl)}`)
        const data = await parseApiResponse(response)
        const preview =
          (data.preview as { url?: string; title?: string | null; description?: string | null } | undefined) ?? null
        if (!preview) {
          throw new Error('リンク情報の取得に失敗しました')
        }

        setNewGearUrl((preview.url ?? targetUrl).trim())
        setNewGearTitle((preview.title ?? '').trim())
        setNewGearDescription((preview.description ?? '').trim())
        setAddDialogStep('edit')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'リンク情報の取得に失敗しました'
        showToast(message, 'error')
      } finally {
        setIsFetchingPreview(false)
      }
    },
    [newGearUrl, parseApiResponse, showToast],
  )

  const handleCreateGearFromUrl = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!newGearUrl.trim()) {
        showToast('URLを入力してください', 'error')
        return
      }

      const nextCategory = newGearCategory.trim()

      setIsAdding(true)

      try {
        const data = await requestWithAuth('/api/admin/gear-items/from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: newGearUrl.trim(),
            title: newGearTitle.trim() || undefined,
            description: newGearDescription.trim() || undefined,
            category: nextCategory || undefined,
            imageFit: newGearImageFit,
          }),
        })
        const insertedItem = (data.item as GearItem | undefined) ?? null
        if (!insertedItem) {
          throw new Error('カード化に失敗しました')
        }
        const normalizedInsertedItem = normalizeGearItem(insertedItem)
        setGearItems((previous) =>
          sortGearItems([...previous.filter((entry) => entry.id !== normalizedInsertedItem.id), normalizedInsertedItem]),
        )
        setNewGearUrl('')
        setNewGearTitle('')
        setNewGearDescription('')
        setNewGearCategory('')
        setNewGearImageFit('contain')
        setAddDialogStep('url')
        setIsAddFormOpen(false)
        showToast('カードを追加しました。', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'カード追加に失敗しました'
        showToast(message, 'error')
      } finally {
        setIsAdding(false)
      }
    },
    [
      newGearCategory,
      newGearDescription,
      newGearImageFit,
      newGearTitle,
      newGearUrl,
      requestWithAuth,
      showToast,
      sortGearItems,
    ],
  )

  const handleRequestDeleteGearItem = useCallback(
    (item: GearItem) => {
      if (deletingGearId !== null) {
        return
      }
      setDeleteConfirmTarget(item)
    },
    [deletingGearId],
  )

  const handleCloseDeleteDialog = useCallback(() => {
    if (deletingGearId !== null) {
      return
    }
    setDeleteConfirmTarget(null)
  }, [deletingGearId])

  const handleConfirmDeleteGearItem = useCallback(async () => {
    if (!deleteConfirmTarget) {
      return
    }

    const target = deleteConfirmTarget
    setDeletingGearId(target.id)

    try {
      await requestWithAuth(`/api/admin/gear-items/${target.id}`, {
        method: 'DELETE',
      })
      setGearItems((previous) => previous.filter((entry) => entry.id !== target.id))
      if (editingGearId === target.id) {
        setEditingGearId(null)
        setEditTitle('')
        setEditDescription('')
        setEditCategory('')
        setEditImageFit('contain')
      }
      setDeleteConfirmTarget(null)
      showToast('カードを削除しました。', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'カード削除に失敗しました'
      showToast(message, 'error')
    } finally {
      setDeletingGearId(null)
    }
  }, [deleteConfirmTarget, editingGearId, requestWithAuth, showToast])

  const reorderGearItems = useCallback((items: GearItem[], sourceId: number, targetId: number) => {
    if (sourceId === targetId) {
      return items
    }

    const sourceIndex = items.findIndex((item) => item.id === sourceId)
    const targetIndex = items.findIndex((item) => item.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) {
      return items
    }

    const next = [...items]
    const [movedItem] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, movedItem)
    return next.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))
  }, [])

  const handleGearDragStart = useCallback(
    (event: DragEvent<HTMLLIElement>, id: number) => {
      if (!accessToken || isReordering || selectedCategory !== 'all') {
        event.preventDefault()
        return
      }
      event.dataTransfer.effectAllowed = 'move'
      setDraggingGearId(id)
    },
    [accessToken, isReordering, selectedCategory],
  )

  const handleGearDragOver = useCallback((event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleGearDrop = useCallback(
    async (targetId: number) => {
      if (!accessToken || isReordering || draggingGearId === null) {
        return
      }

      const previousItems = gearItems
      const reorderedItems = reorderGearItems(previousItems, draggingGearId, targetId)
      setDraggingGearId(null)
      setDragOverGearId(null)

      if (reorderedItems === previousItems) {
        return
      }

      setGearItems(reorderedItems)
      setIsReordering(true)

      try {
        await requestWithAuth('/api/admin/gear-items/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds: reorderedItems.map((item) => item.id) }),
        })
        showToast('並び順を更新しました。', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : '並び替えの保存に失敗しました'
        setGearItems(previousItems)
        showToast(message, 'error')
      } finally {
        setIsReordering(false)
      }
    },
    [accessToken, draggingGearId, gearItems, isReordering, reorderGearItems, requestWithAuth, showToast],
  )

  const handleStartEditGearItem = useCallback((item: GearItem) => {
    openEditGearItem(item)
  }, [openEditGearItem])

  const handleCancelEdit = useCallback(() => {
    setEditingGearId(null)
    setEditTitle('')
    setEditDescription('')
    setEditCategory('')
    setEditImageFit('contain')
  }, [])

  useEffect(() => {
    if (!accessToken || isEditMode) {
      return
    }
    setIsAddFormOpen(false)
    setAddDialogStep('url')
    setDeleteConfirmTarget(null)
    setEditingGearId(null)
    setEditTitle('')
    setEditDescription('')
    setEditCategory('')
    setEditImageFit('contain')
    setDraggingGearId(null)
    setDragOverGearId(null)
  }, [accessToken, isEditMode])

  const handleCloseEditDialog = useCallback(() => {
    if (isUpdating) {
      return
    }
    handleCancelEdit()
  }, [handleCancelEdit, isUpdating])

  const handleUpdateGearItem = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!editingGearId) {
        return
      }

      const nextTitle = editTitle.trim()
      if (!nextTitle) {
        showToast('タイトルを入力してください', 'error')
        return
      }

      const nextCategory = editCategory.trim()

      setIsUpdating(true)

      try {
        const data = await requestWithAuth(`/api/admin/gear-items/${editingGearId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: nextTitle,
            description: editDescription,
            category: nextCategory,
            imageFit: editImageFit,
          }),
        })
        const updatedItem = (data.item as GearItem | undefined) ?? null
        if (!updatedItem) {
          throw new Error('カード更新に失敗しました')
        }
        setGearItems((previous) =>
          sortGearItems(
            previous.map((entry) =>
              entry.id === updatedItem.id ? normalizeGearItem({ ...entry, ...updatedItem }) : entry,
            ),
          ),
        )
        setEditingGearId(null)
        setEditTitle('')
        setEditDescription('')
        setEditCategory('')
        setEditImageFit('contain')
        showToast('カードを更新しました。', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'カード更新に失敗しました'
        showToast(message, 'error')
      } finally {
        setIsUpdating(false)
      }
    },
    [
      editCategory,
      editDescription,
      editImageFit,
      editTitle,
      editingGearId,
      requestWithAuth,
      showToast,
      sortGearItems,
    ],
  )

  const canReorder = Boolean(isAdminEditing && selectedCategory === 'all')

  return (
    <main className="page">
      {accessToken ? (
        <button
          className={`mode-toggle-button${isEditMode ? ' is-edit' : ''}`}
          type="button"
          aria-pressed={isEditMode}
          disabled={isModeToggleLocked}
          onClick={() => setIsEditMode((prev) => !prev)}
        >
          {isEditMode ? <Pencil2Icon /> : <EyeOpenIcon />}
          <span>{isEditMode ? '編集モード' : '閲覧モード'}</span>
        </button>
      ) : null}

      <section className="title-area" aria-label="profile header">
        <img className="main-image" src="/usagi_toilet.png" alt="うさぎのイラスト" />

        <div className="name-block" aria-label="name">
          <p className="name-main" onClick={handleHiddenTrigger}>
            ICH
          </p>
        </div>

        <p className="intro-text" aria-live="polite">
          {typedChars.map((char, index) => (
            <span key={`${char}-${index}`} className="typed-char">
              {char}
            </span>
          ))}
          <span className={`typing-caret${isTypingDone ? ' is-hidden' : ''}`} aria-hidden="true">
            |
          </span>
        </p>
      </section>

      <section className="twitch-zone" aria-label="twitch">
        <div className="twitch-wide-card">
          <a className="twitch-side-link" href={twitchChannelUrl} target="_blank" rel="noreferrer">
            <img className="twitch-side-icon" src="/icons/twitch.svg" alt="" aria-hidden="true" />
            <p className="twitch-side-title">Twitch</p>
          </a>

          <div className="twitch-main">
            {IS_LIVE ? (
              <div className="twitch-embed-wrap">
                <iframe
                  title="ichi0g0y Twitch Channel"
                  src={twitchEmbedSrc}
                  className="twitch-embed"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="twitch-offline">
                <p className="twitch-offline-title">現在はオフラインです</p>
                <p className="twitch-offline-text">次の配信まで少し待っててください。</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <nav className="cards" aria-label="profile links">
        {links.map((link) => (
          <a key={link.href} className="card" href={link.href} target="_blank" rel="noreferrer">
            <img className="card-icon" src={link.icon} alt="" aria-hidden="true" />
            <h2 className="card-title">{link.label}</h2>
          </a>
        ))}
      </nav>

      <section className="gear-zone" aria-label="setup">
        <div className="gear-header">
          <h2 className="gear-heading">機材紹介</h2>
          <p className="gear-description">配信と制作で使っている機材をまとめています。</p>
          <p className="gear-note">リンクはアフィリエイトではありません。</p>
          {isAdminEditing ? (
            <button className="gear-add-button" type="button" onClick={handleOpenAddDialog}>
              <PlusIcon />
            </button>
          ) : null}
        </div>

        <div className="gear-filter-row">
          <button
            type="button"
            className={`gear-filter-chip${selectedCategory === 'all' ? ' is-active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            すべて
          </button>
          {categoryOptions.map((category) => (
            <button
              key={`filter-${category}`}
              type="button"
              className={`gear-filter-chip${selectedCategory === category ? ' is-active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        {isAdminEditing && !canReorder ? <p className="gear-filter-note">並び替えは「すべて」表示で行えます。</p> : null}

        {isGearLoading ? <p className="gear-loading">機材情報を読み込み中...</p> : null}

        <ul className="gear-item-grid">
          {filteredGearItems.map((item) => (
            <li
              key={`${item.id}-${item.title}`}
              className={`gear-item-card${canReorder ? ' is-admin' : ''}${draggingGearId === item.id ? ' is-dragging' : ''}${dragOverGearId === item.id ? ' is-drop-target' : ''}`}
              draggable={canReorder}
              onDragStart={(event) => handleGearDragStart(event, item.id)}
              onDragOver={handleGearDragOver}
              onDragEnter={() => setDragOverGearId(item.id)}
              onDrop={() => {
                void handleGearDrop(item.id)
              }}
              onDragEnd={() => {
                setDraggingGearId(null)
                setDragOverGearId(null)
              }}
            >
              {isAdminEditing ? (
                <div className="gear-card-actions">
                  <button
                    className="gear-card-badge"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      handleStartEditGearItem(item)
                    }}
                    disabled={deletingGearId === item.id || isUpdating}
                    aria-label={`${item.title} を編集`}
                  >
                    <Pencil2Icon />
                  </button>
                  <button
                    className="gear-card-badge"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      handleRequestDeleteGearItem(item)
                    }}
                    disabled={deletingGearId === item.id}
                    aria-label={`${item.title} を削除`}
                  >
                    <Cross2Icon />
                  </button>
                </div>
              ) : null}
              {item.linkUrl ? (
                <a className="gear-item-link" href={item.linkUrl} target="_blank" rel="noreferrer">
                  <img
                    className={`gear-item-photo${item.imageFit === 'contain' ? ' is-contain' : ''}`}
                    src={item.imageUrl ?? '/gear/gaming-pc.jpg'}
                    alt={`${item.title} の画像`}
                    loading="lazy"
                  />
                  <p className="gear-item-name">{item.title}</p>
                  <p className="gear-item-meta">{item.category}</p>
                  {item.description ? <p className="gear-item-description">{item.description}</p> : null}
                </a>
              ) : (
                <div className="gear-item-link">
                  <img
                    className={`gear-item-photo${item.imageFit === 'contain' ? ' is-contain' : ''}`}
                    src={item.imageUrl ?? '/gear/gaming-pc.jpg'}
                    alt={`${item.title} の画像`}
                    loading="lazy"
                  />
                  <p className="gear-item-name">{item.title}</p>
                  <p className="gear-item-meta">{item.category}</p>
                  {item.description ? <p className="gear-item-description">{item.description}</p> : null}
                </div>
              )}
            </li>
          ))}
        </ul>
        {!isGearLoading && filteredGearItems.length < 1 ? (
          <p className="gear-loading">選択中のカテゴリには機材がありません。</p>
        ) : null}
      </section>

      {isAdminEditing && isAddFormOpen ? (
        <div className="auth-dialog-backdrop" role="presentation" onClick={handleCloseAddDialog}>
          <section
            className="auth-dialog gear-add-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={addDialogStep === 'url' ? '機材URLを入力' : '機材カードを追加'}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-dialog-header">
              <p className="auth-dialog-title">{addDialogStep === 'url' ? 'URLを入力' : '機材カードを追加'}</p>
              <button
                className="auth-dialog-close"
                type="button"
                onClick={handleCloseAddDialog}
                disabled={isAdding || isFetchingPreview}
                aria-label="閉じる"
              >
                <Cross2Icon />
              </button>
            </div>

            {addDialogStep === 'url' ? (
              <form className="admin-form add-form" onSubmit={handleLoadPreviewForAddDialog}>
                <label className="admin-label">
                  URL
                  <input
                    className="admin-input"
                    type="url"
                    value={newGearUrl}
                    onChange={(event) => setNewGearUrl(event.target.value)}
                    placeholder="https://..."
                    required
                  />
                </label>
                <p className="add-dialog-note">次へを押すとリンク情報を取得し、編集画面を開きます。</p>
                <div className="admin-form-actions">
                  <button className="admin-button ghost" type="button" onClick={handleCloseAddDialog} disabled={isFetchingPreview}>
                    キャンセル
                  </button>
                  <button className="admin-button" type="submit" disabled={isFetchingPreview}>
                    {isFetchingPreview ? '取得中...' : '次へ'}
                  </button>
                </div>
              </form>
            ) : (
              <form className="admin-form add-form" onSubmit={handleCreateGearFromUrl}>
                <label className="admin-label">
                  URL
                  <input
                    className="admin-input"
                    type="url"
                    value={newGearUrl}
                    onChange={(event) => setNewGearUrl(event.target.value)}
                    placeholder="https://..."
                    required
                  />
                </label>
                <label className="admin-label">
                  タイトル（任意）
                  <input
                    className="admin-input"
                    type="text"
                    value={newGearTitle}
                    onChange={(event) => setNewGearTitle(event.target.value)}
                    placeholder="カードタイトル"
                  />
                </label>
                <label className="admin-label">
                  説明（任意）
                  <textarea
                    className="admin-textarea"
                    value={newGearDescription}
                    onChange={(event) => setNewGearDescription(event.target.value)}
                    placeholder="説明文"
                  />
                </label>
                <label className="admin-label">
                  カテゴリ
                  <CategoryCommandField
                    value={newGearCategory}
                    options={categoryOptions}
                    onValueChange={setNewGearCategory}
                    placeholder="カテゴリを入力（候補から選択可）"
                  />
                </label>
                <label className="admin-label">
                  画像表示
                  <div className="admin-switch-row">
                    <span className="admin-switch-text">
                      {newGearImageFit === 'contain' ? '画像を収める' : '領域全体に表示'}
                    </span>
                    <ImageFitSwitch
                      checked={newGearImageFit === 'contain'}
                      onCheckedChange={(nextChecked) => setNewGearImageFit(nextChecked ? 'contain' : 'cover')}
                    />
                  </div>
                </label>
                <div className="admin-form-actions">
                  <button className="admin-button ghost" type="button" onClick={() => setAddDialogStep('url')} disabled={isAdding}>
                    戻る
                  </button>
                  <button className="admin-button" type="submit" disabled={isAdding}>
                    {isAdding ? '追加中...' : 'カード追加'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}

      {isAdminEditing && editingGearId ? (
        <div className="auth-dialog-backdrop" role="presentation" onClick={handleCloseEditDialog}>
          <section
            className="auth-dialog gear-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="カードを編集"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-dialog-header">
              <p className="auth-dialog-title">カードを編集</p>
              <button
                className="auth-dialog-close"
                type="button"
                onClick={handleCloseEditDialog}
                disabled={isUpdating}
                aria-label="閉じる"
              >
                <Cross2Icon />
              </button>
            </div>

            <form className="admin-form add-form" onSubmit={handleUpdateGearItem}>
              <label className="admin-label">
                タイトル
                <input
                  className="admin-input"
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="カードタイトル"
                  required
                />
              </label>
              <label className="admin-label">
                説明
                <textarea
                  className="admin-textarea"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="説明文"
                />
              </label>
              <label className="admin-label">
                カテゴリ
                <CategoryCommandField
                  value={editCategory}
                  options={categoryOptions}
                  onValueChange={setEditCategory}
                  placeholder="カテゴリを入力（候補から選択可）"
                />
              </label>
              <label className="admin-label">
                画像表示
                <div className="admin-switch-row">
                  <span className="admin-switch-text">{editImageFit === 'contain' ? '画像を収める' : '領域全体に表示'}</span>
                  <ImageFitSwitch
                    checked={editImageFit === 'contain'}
                    onCheckedChange={(nextChecked) => setEditImageFit(nextChecked ? 'contain' : 'cover')}
                  />
                </div>
              </label>
              <div className="admin-form-actions">
                <button className="admin-button ghost" type="button" onClick={handleCloseEditDialog} disabled={isUpdating}>
                  キャンセル
                </button>
                <button className="admin-button" type="submit" disabled={isUpdating}>
                  {isUpdating ? '更新中...' : 'カード更新'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {deleteConfirmTarget ? (
        <div className="auth-dialog-backdrop" role="presentation" onClick={handleCloseDeleteDialog}>
          <section
            className="auth-dialog confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="カード削除確認"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-dialog-header">
              <p className="auth-dialog-title">カードを削除</p>
              <button
                className="auth-dialog-close"
                type="button"
                onClick={handleCloseDeleteDialog}
                disabled={deletingGearId === deleteConfirmTarget.id}
                aria-label="閉じる"
              >
                <Cross2Icon />
              </button>
            </div>
            <p className="confirm-dialog-message">「{deleteConfirmTarget.title}」を削除しますか？</p>
            <div className="admin-form-actions">
              <button
                className="admin-button ghost"
                type="button"
                onClick={handleCloseDeleteDialog}
                disabled={deletingGearId === deleteConfirmTarget.id}
              >
                キャンセル
              </button>
              <button
                className="admin-button danger"
                type="button"
                onClick={() => {
                  void handleConfirmDeleteGearItem()
                }}
                disabled={deletingGearId === deleteConfirmTarget.id}
              >
                {deletingGearId === deleteConfirmTarget.id ? '削除中...' : '削除する'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isAuthDialogOpen ? (
        <div className="auth-dialog-backdrop" role="presentation" onClick={handleCloseAuthDialog}>
          <section
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="管理ログイン"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-dialog-header">
              <p className="auth-dialog-title">管理モード</p>
              <button
                className="auth-dialog-close"
                type="button"
                onClick={handleCloseAuthDialog}
                disabled={isAuthBusy}
                aria-label="閉じる"
              >
                <Cross2Icon />
              </button>
            </div>

            {accessToken && adminEmail ? (
              <div className="admin-signed-in">
                <p className="admin-state">ログイン中: {adminEmail}</p>
                <button className="admin-button ghost" type="button" onClick={handleLogout} disabled={isAuthBusy}>
                  ログアウト
                </button>
              </div>
            ) : loginStep === 'email' ? (
              <form className="admin-form auth-form" onSubmit={handleRequestCode}>
                <label className="admin-label">
                  メールアドレス
                  <input
                    className="admin-input"
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    placeholder="allowed@example.com"
                    required
                  />
                </label>
                <button className="admin-button" type="submit" disabled={isAuthBusy}>
                  {isAuthBusy ? '送信中...' : '認証コード送信'}
                </button>
              </form>
            ) : (
              <form className="admin-form auth-form" onSubmit={handleVerifyCode}>
                <p className="auth-step-note">{loginEmail.trim()} へ送った認証コードを入力してください。</p>
                <label className="admin-label">
                  認証コード
                  <input
                    className="admin-input"
                    type="text"
                    value={loginCode}
                    onChange={(event) => setLoginCode(event.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    placeholder="6桁コード"
                    required
                  />
                </label>
                <div className="auth-step-actions">
                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => {
                      setLoginStep('email')
                      setLoginCode('')
                      setAuthMessage('')
                    }}
                    disabled={isAuthBusy}
                  >
                    メールを変更
                  </button>
                  <button className="admin-button" type="submit" disabled={isAuthBusy}>
                    {isAuthBusy ? '確認中...' : 'ログイン'}
                  </button>
                </div>
              </form>
            )}

            {devAuthCode ? <p className="admin-message">開発用コード: {devAuthCode}</p> : null}
            {authMessage ? <p className="admin-message">{authMessage}</p> : null}
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className={`app-toast is-${toast.tone}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}

      <footer className="copyright">Copyright © {new Date().getFullYear()} ichi0g0y</footer>
    </main>
  )
}

export default App
