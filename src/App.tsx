import { ChevronDownIcon, Cross2Icon, EyeOpenIcon, Pencil2Icon, PlusIcon } from '@radix-ui/react-icons'
import { Command } from 'cmdk'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'

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
  imageUrls: string[]
  imageFit: 'cover' | 'contain'
  linkUrl: string | null
  description: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

type ToastTone = 'success' | 'error' | 'info'
type AddDialogStep = 'url' | 'edit'

type LinkPreviewData = {
  url?: string
  title?: string | null
  description?: string | null
  imageUrl?: string | null
  imageCandidates?: string[]
}

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
    imageUrls: ['/gear/gaming-pc.jpg'],
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
    imageUrls: ['/gear/gaming-pc.jpg'],
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
    imageUrls: ['/gear/gaming-pc.jpg'],
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
    imageUrls: ['/gear/stream-audio.jpg'],
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
    imageUrls: ['/gear/stream-audio.jpg'],
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
    imageUrls: ['/gear/stream-audio.jpg'],
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

function getAuthErrorMessage(errorCode: string) {
  switch (errorCode) {
    case 'oauth_denied':
      return 'GitHubログインがキャンセルされました。'
    case 'state_mismatch':
      return 'ログイン処理の整合性チェックに失敗しました。再試行してください。'
    case 'token_exchange_failed':
      return 'GitHubとの認証連携に失敗しました。'
    case 'github_user_failed':
      return 'GitHubアカウント情報の取得に失敗しました。'
    case 'forbidden_user':
      return 'このGitHubアカウントは管理モードに許可されていません。'
    default:
      return 'ログインに失敗しました。'
  }
}

function normalizeImageFit(value: unknown): GearItem['imageFit'] {
  return value === 'cover' ? 'cover' : 'contain'
}

function normalizeImageUrls(values: unknown, fallbackImageUrl: string | null) {
  const resolved = Array.isArray(values) ? values : []
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const value of resolved) {
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  const fallback = typeof fallbackImageUrl === 'string' ? fallbackImageUrl.trim() : ''
  if (fallback && !seen.has(fallback)) {
    normalized.unshift(fallback)
  }

  return normalized
}

function normalizeGearItem(item: GearItem): GearItem {
  const imageUrls = normalizeImageUrls(item.imageUrls, item.imageUrl)
  return {
    ...item,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
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
  const [authMessage, setAuthMessage] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isEditMode, setIsEditMode] = useState(true)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [newGearUrl, setNewGearUrl] = useState('')
  const [newGearTitle, setNewGearTitle] = useState('')
  const [newGearDescription, setNewGearDescription] = useState('')
  const [newGearCategory, setNewGearCategory] = useState('')
  const [newGearImageUrls, setNewGearImageUrls] = useState<string[]>([])
  const [newGearImageCandidates, setNewGearImageCandidates] = useState<string[]>([])
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
  const [editOriginalCategory, setEditOriginalCategory] = useState('')
  const [editImageUrls, setEditImageUrls] = useState<string[]>([])
  const [editImageUrlInput, setEditImageUrlInput] = useState('')
  const [editDraggingImageIndex, setEditDraggingImageIndex] = useState<number | null>(null)
  const [editDragOverImageIndex, setEditDragOverImageIndex] = useState<number | null>(null)
  const [editPreviewUrl, setEditPreviewUrl] = useState('')
  const [editImageCandidates, setEditImageCandidates] = useState<string[]>([])
  const [editImageFit, setEditImageFit] = useState<GearItem['imageFit']>('contain')
  const [isFetchingEditPreview, setIsFetchingEditPreview] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [gearImageIndexes, setGearImageIndexes] = useState<Record<number, number>>({})
  const [renameCategoryTarget, setRenameCategoryTarget] = useState<string | null>(null)
  const [renameCategoryValue, setRenameCategoryValue] = useState('')
  const [isRenamingCategory, setIsRenamingCategory] = useState(false)
  const tapStateRef = useRef({ count: 0, lastTappedAt: 0 })
  const isAdminEditing = Boolean(accessToken && isEditMode)
  const isModeToggleLocked = isAdding || isFetchingPreview || isUpdating || deletingGearId !== null || isRenamingCategory

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
  const newGearImageUrlSet = useMemo(() => new Set(newGearImageUrls), [newGearImageUrls])
  const editImageUrlSet = useMemo(() => new Set(editImageUrls), [editImageUrls])

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
    const url = new URL(window.location.href)
    const authError = url.searchParams.get('auth_error')
    if (!authError) {
      return
    }
    setAuthMessage(getAuthErrorMessage(authError))
    setIsAuthDialogOpen(true)
    url.searchParams.delete('auth_error')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

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
      setAuthMessage('')
    }
  }, [])

  const handleCloseAuthDialog = useCallback(() => {
    if (isAuthBusy) {
      return
    }
    setIsAuthDialogOpen(false)
    setAuthMessage('')
  }, [isAuthBusy])

  const handleStartGitHubAuth = useCallback(() => {
    setIsAuthBusy(true)
    setAuthMessage('GitHubへ移動しています...')
    window.location.assign('/api/auth/github/start')
  }, [])

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
      setNewGearImageUrls([])
      setNewGearImageCandidates([])
      setNewGearImageFit('contain')
      setAddDialogStep('url')
      setIsFetchingPreview(false)
      setEditingGearId(null)
      setDeleteConfirmTarget(null)
      setEditTitle('')
      setEditDescription('')
      setEditCategory('')
      setEditOriginalCategory('')
      setEditImageUrls([])
      setEditImageUrlInput('')
      setEditDraggingImageIndex(null)
      setEditDragOverImageIndex(null)
      setEditPreviewUrl('')
      setEditImageCandidates([])
      setIsFetchingEditPreview(false)
      setEditImageFit('contain')
      setRenameCategoryTarget(null)
      setRenameCategoryValue('')
      setIsRenamingCategory(false)
      setSelectedCategory('all')
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
    setEditOriginalCategory(item.category)
    setEditImageUrls(normalizeImageUrls(item.imageUrls, item.imageUrl))
    setEditImageUrlInput('')
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
    setEditPreviewUrl(item.linkUrl ?? '')
    setEditImageCandidates([])
    setIsFetchingEditPreview(false)
    setEditImageFit(item.imageFit)
    setIsAddFormOpen(false)
  }, [])

  const handleOpenAddDialog = useCallback(() => {
    setNewGearUrl('')
    setNewGearTitle('')
    setNewGearDescription('')
    setNewGearCategory('')
    setNewGearImageUrls([])
    setNewGearImageCandidates([])
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
    setNewGearImageUrls([])
    setNewGearImageCandidates([])
  }, [isAdding, isFetchingPreview])

  const handleOpenRenameCategoryDialog = useCallback((event: ReactMouseEvent<HTMLButtonElement>, category: string) => {
    event.preventDefault()
    event.stopPropagation()
    setRenameCategoryTarget(category)
    setRenameCategoryValue(category)
  }, [])

  const handleCloseRenameCategoryDialog = useCallback(() => {
    if (isRenamingCategory) {
      return
    }
    setRenameCategoryTarget(null)
    setRenameCategoryValue('')
  }, [isRenamingCategory])

  const handleSubmitRenameCategory = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!renameCategoryTarget) {
        return
      }

      const oldCategory = renameCategoryTarget.trim()
      const newCategory = renameCategoryValue.trim()
      if (!newCategory) {
        showToast('変更後カテゴリ名を入力してください', 'error')
        return
      }

      if (oldCategory === newCategory) {
        handleCloseRenameCategoryDialog()
        return
      }

      setIsRenamingCategory(true)
      try {
        const data = await requestWithAuth('/api/admin/gear-categories/rename', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldCategory, newCategory }),
        })
        const updatedCount = typeof data.updatedCount === 'number' ? data.updatedCount : null
        setGearItems((previous) =>
          sortGearItems(previous.map((entry) => (entry.category === oldCategory ? { ...entry, category: newCategory } : entry))),
        )
        setSelectedCategory((previous) => (previous === oldCategory ? newCategory : previous))
        setRenameCategoryTarget(null)
        setRenameCategoryValue('')
        showToast(updatedCount === 0 ? '対象カテゴリは見つかりませんでした。' : 'カテゴリ名を変更しました。', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'カテゴリ名の変更に失敗しました'
        showToast(message, 'error')
      } finally {
        setIsRenamingCategory(false)
      }
    },
    [handleCloseRenameCategoryDialog, renameCategoryTarget, renameCategoryValue, requestWithAuth, showToast, sortGearItems],
  )

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
        const preview = (data.preview as LinkPreviewData | undefined) ?? null
        if (!preview) {
          throw new Error('リンク情報の取得に失敗しました')
        }

        setNewGearUrl((preview.url ?? targetUrl).trim())
        setNewGearTitle((preview.title ?? '').trim())
        setNewGearDescription((preview.description ?? '').trim())
        const previewImageUrl = (preview.imageUrl ?? '').trim()
        const previewImageCandidates = (preview.imageCandidates ?? []).filter(
          (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
        )
        const mergedImageCandidates = Array.from(
          new Set([previewImageUrl, ...previewImageCandidates.map((candidate) => candidate.trim())].filter(Boolean)),
        )
        setNewGearImageCandidates(mergedImageCandidates)
        setNewGearImageUrls(mergedImageCandidates.length > 0 ? [mergedImageCandidates[0]] : [])
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

  const handleToggleNewGearImageUrl = useCallback((url: string) => {
    setNewGearImageUrls((previous) => {
      if (previous.includes(url)) {
        return previous.filter((entry) => entry !== url)
      }
      return [...previous, url]
    })
  }, [])

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
            imageUrls: newGearImageUrls,
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
        setNewGearImageUrls([])
        setNewGearImageCandidates([])
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
      newGearImageUrls,
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
        setEditOriginalCategory('')
        setEditImageUrls([])
        setEditImageUrlInput('')
        setEditDraggingImageIndex(null)
        setEditDragOverImageIndex(null)
        setEditPreviewUrl('')
        setEditImageCandidates([])
        setIsFetchingEditPreview(false)
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
      // 画像やリンク上からドラッグしても、常にカード全体のプレビューを表示する。
      const rect = event.currentTarget.getBoundingClientRect()
      event.dataTransfer.setDragImage(event.currentTarget, rect.width / 2, rect.height / 2)
      event.dataTransfer.setData('text/plain', String(id))
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
    setEditOriginalCategory('')
    setEditImageUrls([])
    setEditImageUrlInput('')
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
    setEditPreviewUrl('')
    setEditImageCandidates([])
    setIsFetchingEditPreview(false)
    setEditImageFit('contain')
  }, [])

  useEffect(() => {
    if (!accessToken || isEditMode) {
      return
    }
    setIsAddFormOpen(false)
    setAddDialogStep('url')
    setNewGearImageUrls([])
    setNewGearImageCandidates([])
    setDeleteConfirmTarget(null)
    setEditingGearId(null)
    setEditTitle('')
    setEditDescription('')
    setEditCategory('')
    setEditOriginalCategory('')
    setEditImageUrls([])
    setEditImageUrlInput('')
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
    setEditPreviewUrl('')
    setEditImageCandidates([])
    setIsFetchingEditPreview(false)
    setEditImageFit('contain')
    setRenameCategoryTarget(null)
    setRenameCategoryValue('')
    setIsRenamingCategory(false)
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
      const oldCategory = editOriginalCategory.trim()
      const shouldRenameCategoryGlobally =
        oldCategory.length > 0 && nextCategory.length > 0 && oldCategory !== nextCategory
      const nextImageUrls = editImageUrls

      setIsUpdating(true)

      try {
        if (shouldRenameCategoryGlobally) {
          await requestWithAuth('/api/admin/gear-categories/rename', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              oldCategory,
              newCategory: nextCategory,
            }),
          })
        }

        const data = await requestWithAuth(`/api/admin/gear-items/${editingGearId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: nextTitle,
            description: editDescription,
            category: nextCategory,
            imageUrls: nextImageUrls,
            imageFit: editImageFit,
          }),
        })
        const updatedItem = (data.item as GearItem | undefined) ?? null
        if (!updatedItem) {
          throw new Error('カード更新に失敗しました')
        }
        setGearItems((previous) => {
          const renamedItems = shouldRenameCategoryGlobally
            ? previous.map((entry) => (entry.category === oldCategory ? { ...entry, category: nextCategory } : entry))
            : previous

          return sortGearItems(
            renamedItems.map((entry) =>
              entry.id === updatedItem.id ? normalizeGearItem({ ...entry, ...updatedItem }) : entry,
            ),
          )
        })
        setEditingGearId(null)
        setEditTitle('')
        setEditDescription('')
        setEditCategory('')
        setEditOriginalCategory('')
        setEditImageUrls([])
        setEditImageUrlInput('')
        setEditDraggingImageIndex(null)
        setEditDragOverImageIndex(null)
        setEditPreviewUrl('')
        setEditImageCandidates([])
        setIsFetchingEditPreview(false)
        setEditImageFit('contain')
        showToast(shouldRenameCategoryGlobally ? 'カードを更新し、カテゴリ名を一括変更しました。' : 'カードを更新しました。', 'success')
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
      editImageUrls,
      editImageFit,
      editOriginalCategory,
      editTitle,
      editingGearId,
      requestWithAuth,
      showToast,
      sortGearItems,
    ],
  )

  const handleAddEditImageUrl = useCallback(() => {
    const nextUrl = editImageUrlInput.trim()
    if (!nextUrl) {
      return
    }
    try {
      new URL(nextUrl, window.location.origin)
    } catch {
      showToast('画像URLが不正です', 'error')
      return
    }
    setEditImageUrls((previous) => (previous.includes(nextUrl) ? previous : [...previous, nextUrl]))
    setEditImageUrlInput('')
  }, [editImageUrlInput, showToast])

  const handleToggleEditImageUrl = useCallback((url: string) => {
    setEditImageUrls((previous) => {
      if (previous.includes(url)) {
        return previous.filter((entry) => entry !== url)
      }
      return [...previous, url]
    })
  }, [])

  const handleFetchEditImageCandidates = useCallback(async () => {
    const targetUrl = editPreviewUrl.trim()
    if (!targetUrl) {
      showToast('候補取得用のURLを入力してください', 'error')
      return
    }

    setIsFetchingEditPreview(true)
    try {
      const response = await fetch(`/api/preview?url=${encodeURIComponent(targetUrl)}`)
      const data = await parseApiResponse(response)
      const preview = (data.preview as LinkPreviewData | undefined) ?? null
      if (!preview) {
        throw new Error('リンク情報の取得に失敗しました')
      }
      const previewImageUrl = (preview.imageUrl ?? '').trim()
      const previewImageCandidates = (preview.imageCandidates ?? []).filter(
        (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
      )
      const mergedImageCandidates = Array.from(
        new Set([previewImageUrl, ...previewImageCandidates.map((candidate) => candidate.trim())].filter(Boolean)),
      )
      setEditPreviewUrl((preview.url ?? targetUrl).trim())
      setEditImageCandidates(mergedImageCandidates)
      if (mergedImageCandidates.length < 1) {
        showToast('候補画像が見つかりませんでした', 'info')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '候補画像の取得に失敗しました'
      showToast(message, 'error')
    } finally {
      setIsFetchingEditPreview(false)
    }
  }, [editPreviewUrl, parseApiResponse, showToast])

  const handleRemoveEditImage = useCallback((index: number) => {
    setEditImageUrls((previous) => previous.filter((_, entryIndex) => entryIndex !== index))
  }, [])

  const handlePromoteEditImage = useCallback((index: number) => {
    setEditImageUrls((previous) => {
      if (index < 1 || index >= previous.length) {
        return previous
      }
      const next = [...previous]
      const [selected] = next.splice(index, 1)
      next.unshift(selected)
      return next
    })
  }, [])

  const handleEditImageDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, sourceIndex: number) => {
      if (isUpdating) {
        event.preventDefault()
        return
      }
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(sourceIndex))
      setEditDraggingImageIndex(sourceIndex)
      setEditDragOverImageIndex(sourceIndex)
    },
    [isUpdating],
  )

  const handleEditImageDragOver = useCallback((event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setEditDragOverImageIndex(targetIndex)
  }, [])

  const handleEditImageDrop = useCallback((event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault()
    const sourceRaw = event.dataTransfer.getData('text/plain')
    const sourceIndex = Number.parseInt(sourceRaw, 10)
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex === targetIndex) {
      setEditDraggingImageIndex(null)
      setEditDragOverImageIndex(null)
      return
    }
    setEditImageUrls((previous) => {
      if (sourceIndex >= previous.length || targetIndex < 0 || targetIndex >= previous.length) {
        return previous
      }
      const next = [...previous]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
  }, [])

  const handleEditImageDragEnd = useCallback(() => {
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
  }, [])

  useEffect(() => {
    setGearImageIndexes((previous) => {
      const next: Record<number, number> = {}
      for (const item of gearItems) {
        const count = item.imageUrls.length > 0 ? item.imageUrls.length : item.imageUrl ? 1 : 0
        if (count < 1) {
          continue
        }
        const current = previous[item.id] ?? 0
        next[item.id] = ((current % count) + count) % count
      }
      return next
    })
  }, [gearItems])

  const handleSwitchGearImage = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, item: GearItem, direction: -1 | 1) => {
      event.preventDefault()
      event.stopPropagation()
      const imageCount = item.imageUrls.length
      if (imageCount < 2) {
        return
      }
      setGearImageIndexes((previous) => {
        const current = previous[item.id] ?? 0
        const next = (current + direction + imageCount) % imageCount
        return { ...previous, [item.id]: next }
      })
    },
    [],
  )

  const handleSelectGearImage = useCallback((event: ReactMouseEvent<HTMLButtonElement>, item: GearItem, nextIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    setGearImageIndexes((previous) => ({ ...previous, [item.id]: nextIndex }))
  }, [])

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
            <div key={`filter-${category}`} className="gear-filter-chip-wrap">
              <button
                type="button"
                className={`gear-filter-chip${selectedCategory === category ? ' is-active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
              {isAdminEditing ? (
                <button
                  type="button"
                  className="gear-filter-chip-edit"
                  onClick={(event) => handleOpenRenameCategoryDialog(event, category)}
                  disabled={isRenamingCategory || isUpdating}
                  aria-label={`${category} のカテゴリ名を変更`}
                >
                  <Pencil2Icon />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {isGearLoading ? <p className="gear-loading">機材情報を読み込み中...</p> : null}

        <ul className="gear-item-grid">
          {filteredGearItems.map((item) => {
            const itemImageUrls =
              item.imageUrls.length > 0 ? item.imageUrls : item.imageUrl ? [item.imageUrl] : ['/gear/gaming-pc.jpg']
            const imageCount = itemImageUrls.length
            const imageIndex = imageCount > 0 ? ((gearImageIndexes[item.id] ?? 0) + imageCount) % imageCount : 0
            const currentImageUrl = itemImageUrls[imageIndex] ?? '/gear/gaming-pc.jpg'
            const media = (
              <div className="gear-item-media">
                <img
                  className={`gear-item-photo${item.imageFit === 'contain' ? ' is-contain' : ''}`}
                  src={currentImageUrl}
                  alt={`${item.title} の画像`}
                  loading="lazy"
                  draggable={false}
                />
                {imageCount > 1 ? (
                  <>
                    <button
                      type="button"
                      className="gear-image-nav is-left"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onClick={(event) => handleSwitchGearImage(event, item, -1)}
                      aria-label={`${item.title} の前の画像`}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="gear-image-nav is-right"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onClick={(event) => handleSwitchGearImage(event, item, 1)}
                      aria-label={`${item.title} の次の画像`}
                    >
                      ›
                    </button>
                    <div className="gear-image-dots" role="tablist" aria-label={`${item.title} の画像一覧`}>
                      {itemImageUrls.map((_, index) => (
                        <button
                          key={`${item.id}-dot-${index}`}
                          type="button"
                          className={`gear-image-dot${index === imageIndex ? ' is-active' : ''}`}
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onClick={(event) => handleSelectGearImage(event, item, index)}
                          aria-label={`${index + 1}枚目の画像を表示`}
                          aria-current={index === imageIndex ? 'true' : undefined}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            )

            return (
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
              <div className="gear-item-link">
                {media}
                {item.linkUrl ? (
                  <a
                    className="gear-item-name-link"
                    href={item.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    draggable={false}
                  >
                    {item.title}
                  </a>
                ) : (
                  <p className="gear-item-name">{item.title}</p>
                )}
                <p className="gear-item-meta">{item.category}</p>
                {item.description ? <p className="gear-item-description">{item.description}</p> : null}
              </div>
            </li>
            )
          })}
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
                <p className="add-dialog-note">次へを押すとリンク情報を取得し、編集画面へ進みます。</p>
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
                <div className="selected-image-preview">
                  {newGearImageUrls.length > 0 ? (
                    <img src={newGearImageUrls[0]} alt="選択中の候補画像" loading="lazy" />
                  ) : (
                    <p className="selected-image-empty">画像は設定しません。</p>
                  )}
                </div>
                <p className="selected-image-summary">
                  {newGearImageUrls.length > 0
                    ? `${newGearImageUrls.length}枚選択中（1枚目がサムネイル表示されます）`
                    : '画像は未選択です。'}
                </p>
                {newGearImageCandidates.length > 0 ? (
                  <div className="image-candidate-grid">
                    {newGearImageCandidates.map((candidateUrl, index) => (
                      <button
                        key={`${candidateUrl}-${index}`}
                        className={`image-candidate-button${newGearImageUrlSet.has(candidateUrl) ? ' is-selected' : ''}`}
                        type="button"
                        onClick={() => handleToggleNewGearImageUrl(candidateUrl)}
                        aria-label={`候補画像 ${index + 1} を${newGearImageUrlSet.has(candidateUrl) ? '解除' : '選択'}`}
                      >
                        <img src={candidateUrl} alt={`候補画像 ${index + 1}`} loading="lazy" />
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  className={`image-candidate-none${newGearImageUrls.length < 1 ? ' is-selected' : ''}`}
                  type="button"
                  onClick={() => setNewGearImageUrls([])}
                >
                  画像を設定しない
                </button>
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
                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => setAddDialogStep('url')}
                    disabled={isAdding}
                  >
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
              <p className="add-dialog-note">カテゴリ名を変えると、同じカテゴリの他カードにも一括反映されます。</p>
              <label className="admin-label">
                画像（任意）
                <div className="edit-image-fetch-row">
                  <input
                    className="admin-input"
                    type="url"
                    value={editPreviewUrl}
                    onChange={(event) => setEditPreviewUrl(event.target.value)}
                    placeholder="候補取得元URL（https://...）"
                  />
                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => {
                      void handleFetchEditImageCandidates()
                    }}
                    disabled={isUpdating || isFetchingEditPreview}
                  >
                    {isFetchingEditPreview ? '取得中...' : '候補画像を再取得'}
                  </button>
                </div>
                {editImageCandidates.length > 0 ? (
                  <div className="image-candidate-grid">
                    {editImageCandidates.map((candidateUrl, index) => (
                      <button
                        key={`${candidateUrl}-${index}`}
                        className={`image-candidate-button${editImageUrlSet.has(candidateUrl) ? ' is-selected' : ''}`}
                        type="button"
                        onClick={() => handleToggleEditImageUrl(candidateUrl)}
                        aria-label={`候補画像 ${index + 1} を${editImageUrlSet.has(candidateUrl) ? '解除' : '選択'}`}
                      >
                        <img src={candidateUrl} alt={`候補画像 ${index + 1}`} loading="lazy" />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="edit-image-controls">
                  <input
                    className="admin-input"
                    type="url"
                    value={editImageUrlInput}
                    onChange={(event) => setEditImageUrlInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleAddEditImageUrl()
                      }
                    }}
                    placeholder="https://..."
                  />
                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={handleAddEditImageUrl}
                    disabled={isUpdating || isFetchingEditPreview}
                  >
                    画像を追加
                  </button>
                </div>
                {editImageUrls.length > 0 ? (
                  <div className="edit-image-grid">
                    {editImageUrls.map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className={`edit-image-item${index === 0 ? ' is-primary' : ''}${editDraggingImageIndex === index ? ' is-dragging' : ''}${editDragOverImageIndex === index ? ' is-drop-target' : ''}`}
                        draggable={!isUpdating}
                        onDragStart={(event) => handleEditImageDragStart(event, index)}
                        onDragOver={(event) => handleEditImageDragOver(event, index)}
                        onDrop={(event) => handleEditImageDrop(event, index)}
                        onDragEnd={handleEditImageDragEnd}
                      >
                        <button
                          type="button"
                          className="edit-image-thumb"
                          onClick={() => handlePromoteEditImage(index)}
                          disabled={index === 0 || isUpdating}
                          aria-label={index === 0 ? 'メイン画像' : `${index + 1}枚目をメイン画像にする`}
                        >
                          <img src={url} alt={`編集画像 ${index + 1}`} loading="lazy" />
                        </button>
                        <div className="edit-image-actions">
                          <button
                            className="admin-button ghost"
                            type="button"
                            onClick={() => handlePromoteEditImage(index)}
                            disabled={index === 0 || isUpdating}
                          >
                            先頭にする
                          </button>
                          <button
                            className="admin-button danger"
                            type="button"
                            onClick={() => handleRemoveEditImage(index)}
                            disabled={isUpdating}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="selected-image-empty">画像は設定しません。</p>
                )}
                <p className="selected-image-summary">1枚目がカードの表示画像になります。</p>
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

      {isAdminEditing && renameCategoryTarget ? (
        <div className="auth-dialog-backdrop" role="presentation" onClick={handleCloseRenameCategoryDialog}>
          <section
            className="auth-dialog category-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="カテゴリ名を変更"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-dialog-header">
              <p className="auth-dialog-title">カテゴリ名を変更</p>
              <button
                className="auth-dialog-close"
                type="button"
                onClick={handleCloseRenameCategoryDialog}
                disabled={isRenamingCategory}
                aria-label="閉じる"
              >
                <Cross2Icon />
              </button>
            </div>
            <form className="admin-form auth-form" onSubmit={handleSubmitRenameCategory}>
              <label className="admin-label">
                変更前
                <input className="admin-input" type="text" value={renameCategoryTarget} readOnly />
              </label>
              <label className="admin-label">
                変更後
                <input
                  className="admin-input"
                  type="text"
                  value={renameCategoryValue}
                  onChange={(event) => setRenameCategoryValue(event.target.value)}
                  placeholder="新しいカテゴリ名"
                  required
                />
              </label>
              <p className="add-dialog-note">同じカテゴリ名のカードすべてに反映されます。</p>
              <div className="admin-form-actions">
                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={handleCloseRenameCategoryDialog}
                  disabled={isRenamingCategory}
                >
                  キャンセル
                </button>
                <button className="admin-button" type="submit" disabled={isRenamingCategory}>
                  {isRenamingCategory ? '変更中...' : '変更する'}
                </button>
              </div>
            </form>
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
            ) : (
              <div className="admin-form auth-form">
                <p className="auth-step-note">GitHubアカウントで管理モードにログインします。</p>
                <button className="admin-button" type="button" onClick={handleStartGitHubAuth} disabled={isAuthBusy}>
                  {isAuthBusy ? '移動中...' : 'GitHubでログイン'}
                </button>
              </div>
            )}

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
