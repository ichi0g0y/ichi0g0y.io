import { ChevronDownIcon, Cross2Icon, EyeOpenIcon, GlobeIcon, Pencil2Icon, PlusIcon } from '@radix-ui/react-icons'
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
  type SyntheticEvent,
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
  titleEn?: string | null
  category: string
  categoryEn?: string | null
  imageUrl: string | null
  imageUrls: string[]
  imageFit: 'cover' | 'contain'
  linkUrl: string | null
  description: string | null
  descriptionEn?: string | null
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

type ImageSize = {
  width: number
  height: number
}

type AppLocale = 'ja' | 'en'

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
const DEFAULT_NEW_GEAR_CATEGORY = 'その他'
const APP_LOCALE_STORAGE_KEY = 'app-locale'
// 手動切り替え: 配信中なら true、オフラインなら false
const IS_LIVE = true

const UI_LABELS = {
  ja: {
    modeEdit: '編集モード',
    modeView: '閲覧モード',
    offlineTitle: '現在はオフラインです',
    offlineText: '次の配信まで少し待っててください。',
    picksHeading: 'Picks',
    picksDescription: '配信と制作で使っている機材や好きなものをまとめています。',
    affiliateNote: '**リンクはアフィリエイトではありません**',
    allCategory: 'すべて',
    gearLoading: '機材情報を読み込み中...',
    noItems: '選択中のカテゴリには機材がありません。',
    languageAria: '英語に切り替え',
  },
  en: {
    modeEdit: 'Edit mode',
    modeView: 'View mode',
    offlineTitle: 'Currently offline',
    offlineText: 'Please check back for the next stream.',
    picksHeading: 'Picks',
    picksDescription: 'A collection of gear and favorite things I use for streaming and creating.',
    affiliateNote: '**These links are not affiliate links**',
    allCategory: 'All',
    gearLoading: 'Loading picks...',
    noItems: 'No items in the selected category.',
    languageAria: '日本語に切り替え',
  },
} as const

function getGreetingByHour(date: Date, locale: AppLocale) {
  const hour = date.getHours()

  if (locale === 'en') {
    if (hour >= 4 && hour < 11) {
      return 'Good morning'
    }
    if (hour >= 11 && hour < 18) {
      return 'Hello'
    }
    return 'Good evening'
  }

  if (hour >= 4 && hour < 11) {
    return 'おはようございます'
  }

  if (hour >= 11 && hour < 18) {
    return 'こんにちは'
  }

  return 'こんばんは'
}

function createIntroMessage(locale: AppLocale) {
  const greeting = getGreetingByHour(new Date(), locale)

  if (locale === 'en') {
    return `${greeting},\n\nI'm ICH.\n\nI'm a casual programmer based in Hyogo, Japan. On GitHub, I build vibe-coded projects, and on Twitch I stream work chats, retro console mods, and various games from time to time.\n\nI like making things slowly and playing games lazily. Feel free to say hi anytime.`
  }

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
    titleEn: item.titleEn ?? null,
    categoryEn: item.categoryEn ?? null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    imageFit: normalizeImageFit(item.imageFit),
    descriptionEn: item.descriptionEn ?? null,
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
  const [language, setLanguage] = useState<AppLocale>(() => {
    if (typeof window === 'undefined') {
      return 'ja'
    }
    const stored = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)
    if (stored === 'ja' || stored === 'en') {
      return stored
    }
    return window.navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
  })
  const labels = UI_LABELS[language]
  const introChars = useMemo(() => Array.from(createIntroMessage(language)), [language])
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
  const [newGearCategory, setNewGearCategory] = useState(DEFAULT_NEW_GEAR_CATEGORY)
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
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
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
  const [imageSizesByUrl, setImageSizesByUrl] = useState<Record<string, ImageSize>>({})
  const addDialogUrlInputRef = useRef<HTMLInputElement | null>(null)
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

  const categoryDisplayMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of gearItems) {
      const sourceCategory = item.category.trim()
      if (!sourceCategory || map.has(sourceCategory)) {
        continue
      }
      const translatedCategory = item.categoryEn?.trim()
      map.set(sourceCategory, language === 'en' && translatedCategory ? translatedCategory : sourceCategory)
    }
    return map
  }, [gearItems, language])

  const filteredGearItems = useMemo(() => {
    if (selectedCategory === 'all') {
      return gearItems
    }
    return gearItems.filter((item) => item.category === selectedCategory)
  }, [gearItems, selectedCategory])
  const newGearImageUrlSet = useMemo(() => new Set(newGearImageUrls), [newGearImageUrls])
  const editImageUrlSet = useMemo(() => new Set(editImageUrls), [editImageUrls])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, language)
  }, [language])
  const newGearPrimaryImageUrl = newGearImageUrls[0] ?? null

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: Date.now(), message, tone })
  }, [])

  const handlePreviewImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    const sizeKey = image.dataset.sizeKey?.trim()
    if (!sizeKey) {
      return
    }
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (width < 1 || height < 1) {
      return
    }
    setImageSizesByUrl((previous) => {
      const current = previous[sizeKey]
      if (current?.width === width && current?.height === height) {
        return previous
      }
      return {
        ...previous,
        [sizeKey]: { width, height },
      }
    })
  }, [])

  const getImageSizeLabel = useCallback(
    (url: string) => {
      const size = imageSizesByUrl[url]
      if (!size) {
        return ''
      }
      return `${size.width} x ${size.height}`
    },
    [imageSizesByUrl],
  )

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
    setTypedChars([])

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

  useEffect(() => {
    if (!isAddFormOpen || addDialogStep !== 'url') {
      return
    }
    const frameId = window.requestAnimationFrame(() => {
      addDialogUrlInputRef.current?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [addDialogStep, isAddFormOpen])

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
      setNewGearCategory(DEFAULT_NEW_GEAR_CATEGORY)
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
    setNewGearCategory(DEFAULT_NEW_GEAR_CATEGORY)
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
        setNewGearCategory(DEFAULT_NEW_GEAR_CATEGORY)
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
        setNewGearCategory(DEFAULT_NEW_GEAR_CATEGORY)
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

  const reorderGearItemsInCategory = useCallback((items: GearItem[], sourceId: number, targetId: number, category: string) => {
    if (sourceId === targetId) {
      return items
    }

    const categoryItems = items.filter((item) => item.category === category)
    const sourceIndex = categoryItems.findIndex((item) => item.id === sourceId)
    const targetIndex = categoryItems.findIndex((item) => item.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) {
      return items
    }

    const nextCategoryItems = [...categoryItems]
    const [movedItem] = nextCategoryItems.splice(sourceIndex, 1)
    nextCategoryItems.splice(targetIndex, 0, movedItem)

    let categoryIndex = 0
    const merged = items.map((item) => {
      if (item.category !== category) {
        return item
      }
      const nextItem = nextCategoryItems[categoryIndex]
      categoryIndex += 1
      return nextItem
    })

    return merged.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))
  }, [])

  const reorderGearItemsByCategory = useCallback((items: GearItem[], sourceCategory: string, targetCategory: string) => {
    if (sourceCategory === targetCategory) {
      return items
    }

    const categories = Array.from(new Set(items.map((item) => item.category.trim()).filter((category) => category.length > 0)))
    const sourceIndex = categories.indexOf(sourceCategory)
    const targetIndex = categories.indexOf(targetCategory)
    if (sourceIndex < 0 || targetIndex < 0) {
      return items
    }

    const nextCategories = [...categories]
    const [movedCategory] = nextCategories.splice(sourceIndex, 1)
    nextCategories.splice(targetIndex, 0, movedCategory)

    const itemsByCategory = new Map<string, GearItem[]>()
    const uncategorizedItems: GearItem[] = []
    for (const category of nextCategories) {
      itemsByCategory.set(category, [])
    }

    for (const item of items) {
      const category = item.category.trim()
      if (!category || !itemsByCategory.has(category)) {
        uncategorizedItems.push(item)
        continue
      }
      itemsByCategory.get(category)?.push(item)
    }

    const merged: GearItem[] = []
    for (const category of nextCategories) {
      const groupedItems = itemsByCategory.get(category)
      if (groupedItems && groupedItems.length > 0) {
        merged.push(...groupedItems)
      }
    }
    if (uncategorizedItems.length > 0) {
      merged.push(...uncategorizedItems)
    }

    return merged.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))
  }, [])

  const handleGearDragStart = useCallback(
    (event: DragEvent<HTMLLIElement>, id: number) => {
      if (!accessToken || isReordering) {
        event.preventDefault()
        return
      }
      const sourceItem = gearItems.find((item) => item.id === id)
      if (!sourceItem) {
        event.preventDefault()
        return
      }
      if (selectedCategory !== 'all' && sourceItem.category !== selectedCategory) {
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
    [accessToken, gearItems, isReordering, selectedCategory],
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
      const sourceItem = previousItems.find((item) => item.id === draggingGearId)
      const targetItem = previousItems.find((item) => item.id === targetId)
      if (!sourceItem || !targetItem || sourceItem.category !== targetItem.category) {
        setDraggingGearId(null)
        setDragOverGearId(null)
        return
      }
      if (selectedCategory !== 'all' && sourceItem.category !== selectedCategory) {
        setDraggingGearId(null)
        setDragOverGearId(null)
        return
      }
      const reorderedItems = reorderGearItemsInCategory(previousItems, draggingGearId, targetId, sourceItem.category)
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
    [accessToken, draggingGearId, gearItems, isReordering, reorderGearItemsInCategory, requestWithAuth, selectedCategory, showToast],
  )

  const handleCategoryDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, category: string) => {
      if (!isAdminEditing || isReordering) {
        event.preventDefault()
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      event.dataTransfer.setDragImage(event.currentTarget, rect.width / 2, rect.height / 2)
      event.dataTransfer.setData('text/plain', category)
      event.dataTransfer.effectAllowed = 'move'
      setDraggingCategory(category)
    },
    [isAdminEditing, isReordering],
  )

  const handleCategoryDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleCategoryDrop = useCallback(
    async (targetCategory: string) => {
      if (!accessToken || isReordering || !draggingCategory) {
        return
      }

      const previousItems = gearItems
      const reorderedItems = reorderGearItemsByCategory(previousItems, draggingCategory, targetCategory)
      setDraggingCategory(null)
      setDragOverCategory(null)

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
        showToast('カテゴリ順を更新しました。', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'カテゴリ並び替えの保存に失敗しました'
        setGearItems(previousItems)
        showToast(message, 'error')
      } finally {
        setIsReordering(false)
      }
    },
    [accessToken, draggingCategory, gearItems, isReordering, reorderGearItemsByCategory, requestWithAuth, showToast],
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
    setDraggingCategory(null)
    setDragOverCategory(null)
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

  const draggingGearCategory = useMemo(() => {
    if (draggingGearId === null) {
      return null
    }
    return gearItems.find((item) => item.id === draggingGearId)?.category ?? null
  }, [draggingGearId, gearItems])

  const canReorderCategories = Boolean(isAdminEditing && !isReordering)
  const canReorderCards = Boolean(isAdminEditing && !isReordering)
  const nextLanguage = language === 'ja' ? 'en' : 'ja'

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
          <span>{isEditMode ? labels.modeEdit : labels.modeView}</span>
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
                <p className="twitch-offline-title">{labels.offlineTitle}</p>
                <p className="twitch-offline-text">{labels.offlineText}</p>
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
          <h2 className="gear-heading">{labels.picksHeading}</h2>
          <p className="gear-description">{labels.picksDescription}</p>
          <p className="gear-note">{labels.affiliateNote}</p>
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
            {labels.allCategory}
          </button>
          {categoryOptions.map((category) => (
            <div
              key={`filter-${category}`}
              className={`gear-filter-chip-wrap${canReorderCategories ? ' is-draggable' : ''}${draggingCategory === category ? ' is-dragging' : ''}${dragOverCategory === category ? ' is-drop-target' : ''}`}
              draggable={canReorderCategories}
              onDragStart={(event) => handleCategoryDragStart(event, category)}
              onDragOver={handleCategoryDragOver}
              onDragEnter={() => setDragOverCategory(category)}
              onDrop={() => {
                void handleCategoryDrop(category)
              }}
              onDragEnd={() => {
                setDraggingCategory(null)
                setDragOverCategory(null)
              }}
            >
              <button
                type="button"
                className={`gear-filter-chip${selectedCategory === category ? ' is-active' : ''}`}
                onClick={() => setSelectedCategory(category)}
                draggable={false}
              >
                {categoryDisplayMap.get(category) ?? category}
              </button>
              {isAdminEditing ? (
                <button
                  type="button"
                  className="gear-filter-chip-edit"
                  onClick={(event) => handleOpenRenameCategoryDialog(event, category)}
                  disabled={isRenamingCategory || isUpdating}
                  aria-label={`${category} のカテゴリ名を変更`}
                  draggable={false}
                >
                  <Pencil2Icon />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {isGearLoading ? <p className="gear-loading">{labels.gearLoading}</p> : null}

        <ul className="gear-item-grid">
          {filteredGearItems.map((item) => {
            const itemTitle = language === 'en' && item.titleEn ? item.titleEn : item.title
            const itemCategory = language === 'en' && item.categoryEn ? item.categoryEn : item.category
            const itemDescription = language === 'en' && item.descriptionEn ? item.descriptionEn : item.description
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
                  alt={language === 'en' ? `${itemTitle} image` : `${itemTitle} の画像`}
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
                      aria-label={language === 'en' ? `Previous image for ${itemTitle}` : `${itemTitle} の前の画像`}
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
                      aria-label={language === 'en' ? `Next image for ${itemTitle}` : `${itemTitle} の次の画像`}
                    >
                      ›
                    </button>
                    <div
                      className="gear-image-dots"
                      role="tablist"
                      aria-label={language === 'en' ? `Image list for ${itemTitle}` : `${itemTitle} の画像一覧`}
                    >
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
                          aria-label={language === 'en' ? `Show image ${index + 1}` : `${index + 1}枚目の画像を表示`}
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
              className={`gear-item-card${canReorderCards ? ' is-admin' : ''}${draggingGearId === item.id ? ' is-dragging' : ''}${dragOverGearId === item.id ? ' is-drop-target' : ''}${draggingGearCategory && item.category !== draggingGearCategory ? ' is-category-muted' : ''}`}
              draggable={canReorderCards}
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
                    {itemTitle}
                  </a>
                ) : (
                  <p className="gear-item-name">{itemTitle}</p>
                )}
                <p className="gear-item-meta">{itemCategory}</p>
                {itemDescription ? <p className="gear-item-description">{itemDescription}</p> : null}
              </div>
            </li>
            )
          })}
        </ul>
        {!isGearLoading && filteredGearItems.length < 1 ? (
          <p className="gear-loading">{labels.noItems}</p>
        ) : null}
      </section>

      {isAdminEditing && isAddFormOpen ? (
        <div className="auth-dialog-backdrop" role="presentation">
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
                    ref={addDialogUrlInputRef}
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
                <div className={`selected-image-preview${newGearImageFit === 'contain' ? ' is-contain' : ''}`}>
                  {newGearPrimaryImageUrl ? (
                    <>
                      <img
                        src={newGearPrimaryImageUrl}
                        alt="選択中の候補画像"
                        loading="lazy"
                        className={newGearImageFit === 'contain' ? 'is-contain' : ''}
                        data-size-key={newGearPrimaryImageUrl}
                        onLoad={handlePreviewImageLoad}
                      />
                      {getImageSizeLabel(newGearPrimaryImageUrl) ? (
                        <span className="preview-image-size">{getImageSizeLabel(newGearPrimaryImageUrl)}</span>
                      ) : null}
                    </>
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
                    {newGearImageCandidates.map((candidateUrl, index) => {
                      const sizeLabel = getImageSizeLabel(candidateUrl)
                      return (
                        <button
                          key={`${candidateUrl}-${index}`}
                          className={`image-candidate-button${newGearImageUrlSet.has(candidateUrl) ? ' is-selected' : ''}`}
                          type="button"
                          onClick={() => handleToggleNewGearImageUrl(candidateUrl)}
                          aria-label={`候補画像 ${index + 1} を${newGearImageUrlSet.has(candidateUrl) ? '解除' : '選択'}`}
                        >
                          <img
                            src={candidateUrl}
                            alt={`候補画像 ${index + 1}`}
                            loading="lazy"
                            className={newGearImageFit === 'contain' ? 'is-contain' : ''}
                            data-size-key={candidateUrl}
                            onLoad={handlePreviewImageLoad}
                          />
                          {sizeLabel ? <span className="preview-image-size">{sizeLabel}</span> : null}
                        </button>
                      )
                    })}
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
                    {editImageCandidates.map((candidateUrl, index) => {
                      const sizeLabel = getImageSizeLabel(candidateUrl)
                      return (
                        <button
                          key={`${candidateUrl}-${index}`}
                          className={`image-candidate-button${editImageUrlSet.has(candidateUrl) ? ' is-selected' : ''}`}
                          type="button"
                          onClick={() => handleToggleEditImageUrl(candidateUrl)}
                          aria-label={`候補画像 ${index + 1} を${editImageUrlSet.has(candidateUrl) ? '解除' : '選択'}`}
                        >
                          <img
                            src={candidateUrl}
                            alt={`候補画像 ${index + 1}`}
                            loading="lazy"
                            className={editImageFit === 'contain' ? 'is-contain' : ''}
                            data-size-key={candidateUrl}
                            onLoad={handlePreviewImageLoad}
                          />
                          {sizeLabel ? <span className="preview-image-size">{sizeLabel}</span> : null}
                        </button>
                      )
                    })}
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
                          className={`edit-image-thumb${editImageFit === 'contain' ? ' is-contain' : ''}`}
                          onClick={() => handlePromoteEditImage(index)}
                          disabled={index === 0 || isUpdating}
                          aria-label={index === 0 ? 'メイン画像' : `${index + 1}枚目をメイン画像にする`}
                        >
                          <img
                            src={url}
                            alt={`編集画像 ${index + 1}`}
                            loading="lazy"
                            className={editImageFit === 'contain' ? 'is-contain' : ''}
                            data-size-key={url}
                            onLoad={handlePreviewImageLoad}
                          />
                          {getImageSizeLabel(url) ? <span className="preview-image-size">{getImageSizeLabel(url)}</span> : null}
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

      <button
        className="language-toggle-button"
        type="button"
        aria-label={labels.languageAria}
        title={labels.languageAria}
        onClick={() => setLanguage(nextLanguage)}
      >
        <GlobeIcon />
        <span className="language-toggle-code" aria-hidden="true">
          {language.toUpperCase()}
        </span>
      </button>

      <footer className="copyright">Copyright © {new Date().getFullYear()} ichi0g0y</footer>
    </main>
  )
}

export default App
