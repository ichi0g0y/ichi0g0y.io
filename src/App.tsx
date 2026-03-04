import { Cross2Icon, EyeOpenIcon, GlobeIcon, MoonIcon, Pencil2Icon, PlusIcon, SunIcon } from '@radix-ui/react-icons'
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

import { AddGearDialog } from './components/AddGearDialog'
import { AuthDialog } from './components/AuthDialog'
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog'
import { EditGearDialog } from './components/EditGearDialog'
import { RenameCategoryDialog } from './components/RenameCategoryDialog'
import {
  APP_LOCALE_STORAGE_KEY,
  APP_THEME_STORAGE_KEY,
  DEFAULT_NEW_GEAR_CATEGORY,
  HIDDEN_TAP_TARGET,
  HIDDEN_TAP_WINDOW_MS,
  IS_LIVE,
  TWITCH_CHANNEL,
  UI_LABELS,
  fallbackGearItems,
  links,
} from './constants'
import { useToast } from './hooks/useToast'
import { useTypewriter } from './hooks/useTypewriter'
import type { AddDialogStep, AppLocale, GearItem, ImageSize, LinkPreviewData } from './types'
import { createIntroMessage, getAuthErrorMessage, normalizeGearItem, normalizeImageUrls } from './utils'

type AppLocalePreference = AppLocale | 'system'
type AppTheme = 'light' | 'dark'
type AppThemePreference = AppTheme | 'system'

function detectSystemLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'ja'
  }
  return window.navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

function detectSystemTheme(): AppTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [languagePreference, setLanguagePreference] = useState<AppLocalePreference>(() => {
    if (typeof window === 'undefined') {
      return 'system'
    }
    const stored = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)
    if (stored === 'system' || stored === 'ja' || stored === 'en') {
      return stored
    }
    return 'system'
  })
  const [themePreference, setThemePreference] = useState<AppThemePreference>(() => {
    if (typeof window === 'undefined') {
      return 'system'
    }
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
    if (stored === 'system' || stored === 'light' || stored === 'dark') {
      return stored
    }
    return 'system'
  })
  const [systemLanguage, setSystemLanguage] = useState<AppLocale>(detectSystemLocale)
  const [systemTheme, setSystemTheme] = useState<AppTheme>(detectSystemTheme)
  const activeLanguage = languagePreference === 'system' ? systemLanguage : languagePreference
  const activeTheme = themePreference === 'system' ? systemTheme : themePreference
  const labels = UI_LABELS[activeLanguage]
  const introChars = useMemo(() => Array.from(createIntroMessage(activeLanguage)), [activeLanguage])
  const twitchChannelUrl = `https://www.twitch.tv/${TWITCH_CHANNEL}`
  const twitchEmbedSrc = useMemo(() => {
    const parents = new Set<string>(['ichi0g0y.io', 'www.ichi0g0y.io'])
    const currentHost = window.location.hostname?.trim().toLowerCase()
    const isLocalHost = currentHost === 'localhost' || currentHost === '127.0.0.1'

    if (currentHost) {
      parents.add(currentHost)
    }
    if (isLocalHost) {
      parents.add('localhost')
    }

    const embedUrl = new URL('https://player.twitch.tv/')
    embedUrl.searchParams.set('channel', TWITCH_CHANNEL)
    embedUrl.searchParams.set('muted', 'true')
    for (const parent of parents) {
      if (!parent) {
        continue
      }
      embedUrl.searchParams.append('parent', parent)
    }
    return embedUrl.toString()
  }, [])
  const typedChars = useTypewriter(introChars)
  const { toast, setToast, showToast } = useToast()
  const [gearItems, setGearItems] = useState<GearItem[]>([])
  const [isGearLoading, setIsGearLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
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
  const [editTitleEn, setEditTitleEn] = useState('')
  const [editOriginalTitleEn, setEditOriginalTitleEn] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDescriptionEn, setEditDescriptionEn] = useState('')
  const [editOriginalDescriptionEn, setEditOriginalDescriptionEn] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editImageUrls, setEditImageUrls] = useState<string[]>([])
  const [editImageUrlInput, setEditImageUrlInput] = useState('')
  const [editDraggingImageIndex, setEditDraggingImageIndex] = useState<number | null>(null)
  const [editDragOverImageIndex, setEditDragOverImageIndex] = useState<number | null>(null)
  const [editPreviewUrl, setEditPreviewUrl] = useState('')
  const [editImageCandidates, setEditImageCandidates] = useState<string[]>([])
  const [editImageFit, setEditImageFit] = useState<GearItem['imageFit']>('contain')
  const [isFetchingEditPreview, setIsFetchingEditPreview] = useState(false)
  const [isTranslatingEditDescriptionEn, setIsTranslatingEditDescriptionEn] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [gearImageIndexes, setGearImageIndexes] = useState<Record<number, number>>({})
  const [renameCategoryTarget, setRenameCategoryTarget] = useState<string | null>(null)
  const [renameCategoryValue, setRenameCategoryValue] = useState('')
  const [renameCategoryValueEn, setRenameCategoryValueEn] = useState('')
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
  const categoryEnByCategory = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of gearItems) {
      const jaCategory = item.category.trim()
      const enCategory = item.categoryEn?.trim() ?? ''
      if (!jaCategory || !enCategory || map.has(jaCategory)) {
        continue
      }
      map.set(jaCategory, enCategory)
    }
    return map
  }, [gearItems])
  const editCategoryDisplayOptions = useMemo(
    () =>
      categoryOptions.map((category) => ({
        value: category,
        label: activeLanguage === 'en' ? categoryEnByCategory.get(category) ?? category : category,
      })),
    [activeLanguage, categoryEnByCategory, categoryOptions],
  )

  const categoryDisplayMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of gearItems) {
      const sourceCategory = item.category.trim()
      if (!sourceCategory || map.has(sourceCategory)) {
        continue
      }
      const translatedCategory = item.categoryEn?.trim()
      map.set(sourceCategory, activeLanguage === 'en' && translatedCategory ? translatedCategory : sourceCategory)
    }
    return map
  }, [activeLanguage, gearItems])

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
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, languagePreference)
  }, [languagePreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, themePreference)
    window.document.body.dataset.theme = activeTheme
  }, [activeTheme, themePreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleLanguageChange = () => {
      setSystemLanguage(detectSystemLocale())
    }
    window.addEventListener('languagechange', handleLanguageChange)
    return () => {
      window.removeEventListener('languagechange', handleLanguageChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = () => {
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    }
    handleThemeChange()
    mediaQuery.addEventListener('change', handleThemeChange)
    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange)
    }
  }, [])
  const newGearPrimaryImageUrl = newGearImageUrls[0] ?? null

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
      setGearItems(sortGearItems(items.map(normalizeGearItem)))
    } catch {
      setGearItems(sortGearItems(fallbackGearItems))
    } finally {
      setIsGearLoading(false)
    }
  }, [parseApiResponse, sortGearItems])

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
      setIsEditMode(false)
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
      setEditTitleEn('')
      setEditOriginalTitleEn('')
      setEditDescription('')
      setEditDescriptionEn('')
      setEditOriginalDescriptionEn('')
      setEditCategory('')
      setEditImageUrls([])
      setEditImageUrlInput('')
      setEditDraggingImageIndex(null)
      setEditDragOverImageIndex(null)
      setEditPreviewUrl('')
      setEditImageCandidates([])
      setIsFetchingEditPreview(false)
      setIsTranslatingEditDescriptionEn(false)
      setEditImageFit('contain')
      setRenameCategoryTarget(null)
      setRenameCategoryValue('')
      setRenameCategoryValueEn('')
      setIsRenamingCategory(false)
      setSelectedCategory('all')
      setAuthMessage('ログアウトしました。')
      setToast(null)
    } finally {
      setIsAuthBusy(false)
    }
  }, [setToast])

  const openEditGearItem = useCallback((item: GearItem) => {
    setEditingGearId(item.id)
    setEditTitle(item.title)
    setEditTitleEn(item.titleEn ?? '')
    setEditOriginalTitleEn(item.titleEn ?? '')
    setEditDescription(item.description ?? '')
    setEditDescriptionEn(item.descriptionEn ?? '')
    setEditOriginalDescriptionEn(item.descriptionEn ?? '')
    setEditCategory(item.category)
    setEditImageUrls(normalizeImageUrls(item.imageUrls, item.imageUrl))
    setEditImageUrlInput('')
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
    setEditPreviewUrl(item.linkUrl ?? '')
    setEditImageCandidates([])
    setIsFetchingEditPreview(false)
    setIsTranslatingEditDescriptionEn(false)
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
    setRenameCategoryValueEn(categoryEnByCategory.get(category) ?? '')
  }, [categoryEnByCategory])

  const handleCloseRenameCategoryDialog = useCallback(() => {
    if (isRenamingCategory) {
      return
    }
    setRenameCategoryTarget(null)
    setRenameCategoryValue('')
    setRenameCategoryValueEn('')
  }, [isRenamingCategory])

  const handleSubmitRenameCategory = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!renameCategoryTarget) {
        return
      }

      const oldCategory = renameCategoryTarget.trim()
      const newCategory = renameCategoryValue.trim()
      const newCategoryEn = renameCategoryValueEn.trim()
      if (!newCategory) {
        showToast('変更後カテゴリ名を入力してください', 'error')
        return
      }

      if (oldCategory === newCategory && (categoryEnByCategory.get(oldCategory) ?? '') === newCategoryEn) {
        handleCloseRenameCategoryDialog()
        return
      }

      setIsRenamingCategory(true)
      try {
        const data = await requestWithAuth('/api/admin/gear-categories/rename', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldCategory, newCategory, newCategoryEn }),
        })
        const updatedCount = typeof data.updatedCount === 'number' ? data.updatedCount : null
        const renamedCategoryEn =
          typeof data.newCategoryEn === 'string'
            ? data.newCategoryEn
            : data.newCategoryEn === null
              ? null
              : newCategoryEn || null
        setGearItems((previous) =>
          sortGearItems(
            previous.map((entry) =>
              entry.category === oldCategory
                ? { ...entry, category: newCategory, categoryEn: renamedCategoryEn }
                : entry,
            ),
          ),
        )
        setSelectedCategory((previous) => (previous === oldCategory ? newCategory : previous))
        setRenameCategoryTarget(null)
        setRenameCategoryValue('')
        setRenameCategoryValueEn('')
        showToast(updatedCount === 0 ? '対象カテゴリは見つかりませんでした。' : 'カテゴリ名を変更しました。', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'カテゴリ名の変更に失敗しました'
        showToast(message, 'error')
      } finally {
        setIsRenamingCategory(false)
      }
    },
    [
      categoryEnByCategory,
      handleCloseRenameCategoryDialog,
      renameCategoryTarget,
      renameCategoryValue,
      renameCategoryValueEn,
      requestWithAuth,
      showToast,
      sortGearItems,
    ],
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
        setEditTitleEn('')
        setEditOriginalTitleEn('')
        setEditDescription('')
        setEditDescriptionEn('')
        setEditOriginalDescriptionEn('')
        setEditCategory('')
        setEditImageUrls([])
        setEditImageUrlInput('')
        setEditDraggingImageIndex(null)
        setEditDragOverImageIndex(null)
        setEditPreviewUrl('')
        setEditImageCandidates([])
        setIsFetchingEditPreview(false)
        setIsTranslatingEditDescriptionEn(false)
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
    setEditTitleEn('')
    setEditOriginalTitleEn('')
    setEditDescription('')
    setEditDescriptionEn('')
    setEditOriginalDescriptionEn('')
    setEditCategory('')
    setEditImageUrls([])
    setEditImageUrlInput('')
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
    setEditPreviewUrl('')
    setEditImageCandidates([])
    setIsFetchingEditPreview(false)
    setIsTranslatingEditDescriptionEn(false)
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
    setEditTitleEn('')
    setEditOriginalTitleEn('')
    setEditDescription('')
    setEditDescriptionEn('')
    setEditOriginalDescriptionEn('')
    setEditCategory('')
    setEditImageUrls([])
    setEditImageUrlInput('')
    setEditDraggingImageIndex(null)
    setEditDragOverImageIndex(null)
    setEditPreviewUrl('')
    setEditImageCandidates([])
    setIsFetchingEditPreview(false)
    setIsTranslatingEditDescriptionEn(false)
    setEditImageFit('contain')
    setRenameCategoryTarget(null)
    setRenameCategoryValue('')
    setRenameCategoryValueEn('')
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
      const nextTitleEn = editTitleEn.trim()
      const oldTitleEn = editOriginalTitleEn.trim()
      const nextCategory = editCategory.trim()
      if (!nextCategory) {
        showToast('カテゴリを入力してください', 'error')
        return
      }
      const nextDescriptionEn = editDescriptionEn.trim()
      const oldDescriptionEn = editOriginalDescriptionEn.trim()
      const shouldUpdateTitleEn = nextTitleEn !== oldTitleEn
      const shouldUpdateDescriptionEn = nextDescriptionEn !== oldDescriptionEn
      const nextImageUrls = editImageUrls
      const selectedCategoryEn = categoryEnByCategory.get(nextCategory) ?? ''

      setIsUpdating(true)

      try {
        const updatePayload: {
          title: string
          description: string
          category: string
          imageUrls: string[]
          imageFit: GearItem['imageFit']
          categoryEn: string
          titleEn?: string
          descriptionEn?: string
        } = {
          title: nextTitle,
          description: editDescription,
          category: nextCategory,
          imageUrls: nextImageUrls,
          imageFit: editImageFit,
          categoryEn: selectedCategoryEn,
        }
        if (shouldUpdateTitleEn) {
          updatePayload.titleEn = nextTitleEn
        }
        if (shouldUpdateDescriptionEn) {
          updatePayload.descriptionEn = nextDescriptionEn
        }

        const data = await requestWithAuth(`/api/admin/gear-items/${editingGearId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })
        const updatedItem = (data.item as GearItem | undefined) ?? null
        if (!updatedItem) {
          throw new Error('カード更新に失敗しました')
        }
        setGearItems((previous) =>
          sortGearItems(
            previous.map((entry) => (entry.id === updatedItem.id ? normalizeGearItem({ ...entry, ...updatedItem }) : entry)),
          ),
        )
        setEditingGearId(null)
        setEditTitle('')
        setEditTitleEn('')
        setEditOriginalTitleEn('')
        setEditDescription('')
        setEditDescriptionEn('')
        setEditOriginalDescriptionEn('')
        setEditCategory('')
        setEditImageUrls([])
        setEditImageUrlInput('')
        setEditDraggingImageIndex(null)
        setEditDragOverImageIndex(null)
        setEditPreviewUrl('')
        setEditImageCandidates([])
        setIsFetchingEditPreview(false)
        setIsTranslatingEditDescriptionEn(false)
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
      editDescriptionEn,
      editImageUrls,
      editImageFit,
      editOriginalDescriptionEn,
      editOriginalTitleEn,
      editTitle,
      editTitleEn,
      editingGearId,
      categoryEnByCategory,
      requestWithAuth,
      showToast,
      sortGearItems,
    ],
  )

  const handleTranslateEditDescriptionEn = useCallback(async () => {
    const sourceDescription = editDescription.trim()
    if (!sourceDescription) {
      showToast('日本語説明を入力してください', 'error')
      return
    }

    setIsTranslatingEditDescriptionEn(true)
    try {
      const data = await requestWithAuth('/api/admin/gear-items/translate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          category: editCategory.trim(),
          description: sourceDescription,
        }),
      })
      const translatedDescription = typeof data.descriptionEn === 'string' ? data.descriptionEn.trim() : ''
      if (!translatedDescription) {
        throw new Error('英語説明の生成に失敗しました')
      }
      setEditDescriptionEn(translatedDescription)
      showToast('英語説明を更新しました。', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : '英語説明の生成に失敗しました'
      showToast(message, 'error')
    } finally {
      setIsTranslatingEditDescriptionEn(false)
    }
  }, [editCategory, editDescription, editTitle, requestWithAuth, showToast])

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
  const languageSystemLabel = activeLanguage === 'ja' ? 'システム' : 'System'
  const themeSystemLabel = activeLanguage === 'ja' ? 'システム' : 'System'
  const themeLightLabel = activeLanguage === 'ja' ? 'ライト' : 'Light'
  const themeDarkLabel = activeLanguage === 'ja' ? 'ダーク' : 'Dark'

  return (
    <main className="page">
      <div className="top-controls">
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

        <div className="top-control-select">
          <span className="top-control-select-icon" aria-hidden="true">
            <GlobeIcon />
          </span>
          <select
            id="language-preference-select"
            className="top-control-select-input"
            aria-label={labels.languageAria}
            value={languagePreference}
            onChange={(event) => setLanguagePreference(event.target.value as AppLocalePreference)}
          >
            <option value="system">{languageSystemLabel}</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="top-control-select">
          <span className="top-control-select-icon" aria-hidden="true">
            {themePreference === 'system'
              ? activeTheme === 'dark'
                ? <MoonIcon />
                : <SunIcon />
              : themePreference === 'dark'
                ? <MoonIcon />
                : <SunIcon />}
          </span>
          <select
            id="theme-preference-select"
            className="top-control-select-input"
            aria-label={labels.themeAria}
            value={themePreference}
            onChange={(event) => setThemePreference(event.target.value as AppThemePreference)}
          >
            <option value="system">{themeSystemLabel}</option>
            <option value="light">{themeLightLabel}</option>
            <option value="dark">{themeDarkLabel}</option>
          </select>
        </div>
      </div>

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
            const itemTitle = activeLanguage === 'en' && item.titleEn ? item.titleEn : item.title
            const itemCategory = activeLanguage === 'en' && item.categoryEn ? item.categoryEn : item.category
            const itemDescription = activeLanguage === 'en' && item.descriptionEn ? item.descriptionEn : item.description
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
                  alt={activeLanguage === 'en' ? `${itemTitle} image` : `${itemTitle} の画像`}
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
                      aria-label={activeLanguage === 'en' ? `Previous image for ${itemTitle}` : `${itemTitle} の前の画像`}
                    >
                      &#x2039;
                    </button>
                    <button
                      type="button"
                      className="gear-image-nav is-right"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onClick={(event) => handleSwitchGearImage(event, item, 1)}
                      aria-label={activeLanguage === 'en' ? `Next image for ${itemTitle}` : `${itemTitle} の次の画像`}
                    >
                      &#x203A;
                    </button>
                    <div
                      className="gear-image-dots"
                      role="tablist"
                      aria-label={activeLanguage === 'en' ? `Image list for ${itemTitle}` : `${itemTitle} の画像一覧`}
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
                          aria-label={activeLanguage === 'en' ? `Show image ${index + 1}` : `${index + 1}枚目の画像を表示`}
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
        <AddGearDialog
          addDialogStep={addDialogStep}
          newGearUrl={newGearUrl}
          newGearTitle={newGearTitle}
          newGearDescription={newGearDescription}
          newGearCategory={newGearCategory}
          newGearImageUrls={newGearImageUrls}
          newGearImageCandidates={newGearImageCandidates}
          newGearImageFit={newGearImageFit}
          newGearImageUrlSet={newGearImageUrlSet}
          newGearPrimaryImageUrl={newGearPrimaryImageUrl}
          categoryOptions={categoryOptions}
          isFetchingPreview={isFetchingPreview}
          isAdding={isAdding}
          imageSizesByUrl={imageSizesByUrl}
          addDialogUrlInputRef={addDialogUrlInputRef}
          onClose={handleCloseAddDialog}
          onSetNewGearUrl={setNewGearUrl}
          onSetNewGearTitle={setNewGearTitle}
          onSetNewGearDescription={setNewGearDescription}
          onSetNewGearCategory={setNewGearCategory}
          onSetNewGearImageUrls={setNewGearImageUrls}
          onSetNewGearImageFit={setNewGearImageFit}
          onSetAddDialogStep={setAddDialogStep}
          onLoadPreview={handleLoadPreviewForAddDialog}
          onCreateGear={handleCreateGearFromUrl}
          onToggleImageUrl={handleToggleNewGearImageUrl}
          onPreviewImageLoad={handlePreviewImageLoad}
          getImageSizeLabel={getImageSizeLabel}
        />
      ) : null}

      {isAdminEditing && editingGearId ? (
        <EditGearDialog
          editTitle={editTitle}
          editTitleEn={editTitleEn}
          editDescription={editDescription}
          editDescriptionEn={editDescriptionEn}
          editCategory={editCategory}
          editCategoryLabel={activeLanguage === 'en' ? categoryEnByCategory.get(editCategory) ?? editCategory : editCategory}
          categoryDisplayOptions={editCategoryDisplayOptions}
          editImageUrls={editImageUrls}
          editImageUrlInput={editImageUrlInput}
          editImageCandidates={editImageCandidates}
          editImageFit={editImageFit}
          editImageUrlSet={editImageUrlSet}
          editPreviewUrl={editPreviewUrl}
          editDraggingImageIndex={editDraggingImageIndex}
          editDragOverImageIndex={editDragOverImageIndex}
          isUpdating={isUpdating}
          isFetchingEditPreview={isFetchingEditPreview}
          imageSizesByUrl={imageSizesByUrl}
          onClose={handleCloseEditDialog}
          onSubmit={handleUpdateGearItem}
          onSetEditTitle={setEditTitle}
          onSetEditTitleEn={setEditTitleEn}
          onSetEditDescription={setEditDescription}
          onSetEditDescriptionEn={setEditDescriptionEn}
          onSetEditCategory={setEditCategory}
          isTranslatingEditDescriptionEn={isTranslatingEditDescriptionEn}
          onTranslateEditDescriptionEn={handleTranslateEditDescriptionEn}
          onSetEditImageUrlInput={setEditImageUrlInput}
          onSetEditPreviewUrl={setEditPreviewUrl}
          onSetEditImageFit={setEditImageFit}
          onAddEditImageUrl={handleAddEditImageUrl}
          onToggleEditImageUrl={handleToggleEditImageUrl}
          onFetchEditImageCandidates={handleFetchEditImageCandidates}
          onRemoveEditImage={handleRemoveEditImage}
          onPromoteEditImage={handlePromoteEditImage}
          onEditImageDragStart={handleEditImageDragStart}
          onEditImageDragOver={handleEditImageDragOver}
          onEditImageDrop={handleEditImageDrop}
          onEditImageDragEnd={handleEditImageDragEnd}
          onPreviewImageLoad={handlePreviewImageLoad}
          getImageSizeLabel={getImageSizeLabel}
        />
      ) : null}

      {deleteConfirmTarget ? (
        <DeleteConfirmDialog
          deleteConfirmTarget={deleteConfirmTarget}
          isDeleting={deletingGearId === deleteConfirmTarget.id}
          onConfirm={handleConfirmDeleteGearItem}
          onClose={handleCloseDeleteDialog}
        />
      ) : null}

      {isAdminEditing && renameCategoryTarget ? (
        <RenameCategoryDialog
          renameCategoryValue={renameCategoryValue}
          renameCategoryValueEn={renameCategoryValueEn}
          isRenamingCategory={isRenamingCategory}
          onChange={setRenameCategoryValue}
          onChangeEn={setRenameCategoryValueEn}
          onSubmit={handleSubmitRenameCategory}
          onClose={handleCloseRenameCategoryDialog}
        />
      ) : null}

      <AuthDialog
        isOpen={isAuthDialogOpen}
        accessToken={accessToken}
        adminEmail={adminEmail}
        authMessage={authMessage}
        isAuthBusy={isAuthBusy}
        onStartGitHubAuth={handleStartGitHubAuth}
        onLogout={handleLogout}
        onClose={handleCloseAuthDialog}
      />

      {toast ? (
        <div className={`app-toast is-${toast.tone}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}

      <footer className="copyright">Copyright &copy; {new Date().getFullYear()} ichi0g0y</footer>
    </main>
  )
}

export default App
