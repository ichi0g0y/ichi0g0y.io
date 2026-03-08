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

import { DEFAULT_NEW_GEAR_CATEGORY, fallbackGearItems } from '../constants'
import type { AddDialogStep, AppLocale, GearItem, ImageSize, LinkPreviewData, ToastTone } from '../types'
import { normalizeGearItem, normalizeImageUrls } from '../utils'

const GEAR_PAGE_SIZE = 12

function sortGearItemsList(items: GearItem[]) {
  return [...items].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder
    }
    return left.id - right.id
  })
}

function applySequentialSortOrder(items: GearItem[]) {
  return items.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))
}

function findCategoryInsertIndex(items: GearItem[], category: string) {
  const targetCategory = category.trim()
  let insertIndex = items.length
  for (let index = 0; index < items.length; index += 1) {
    if (items[index]?.category.trim() === targetCategory) {
      insertIndex = index + 1
    }
  }
  return insertIndex
}

function applyUpdatedGearItemCategorySort(items: GearItem[], updatedItem: GearItem) {
  const normalizedUpdatedItem = normalizeGearItem(updatedItem)
  const currentItems = sortGearItemsList(items)
  const existingItem = currentItems.find((item) => item.id === normalizedUpdatedItem.id) ?? null

  if (!existingItem) {
    const insertIndex = findCategoryInsertIndex(currentItems, normalizedUpdatedItem.category)
    const nextItems = [...currentItems]
    nextItems.splice(insertIndex, 0, normalizedUpdatedItem)
    return applySequentialSortOrder(nextItems)
  }

  if (existingItem.category.trim() === normalizedUpdatedItem.category.trim()) {
    return currentItems.map((item) => (item.id === normalizedUpdatedItem.id ? normalizedUpdatedItem : item))
  }

  const remainingItems = currentItems.filter((item) => item.id !== normalizedUpdatedItem.id)
  const insertIndex = findCategoryInsertIndex(remainingItems, normalizedUpdatedItem.category)
  const nextItems = [...remainingItems]
  nextItems.splice(insertIndex, 0, normalizedUpdatedItem)
  return applySequentialSortOrder(nextItems)
}

async function parsePublicApiResponse(response: Response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message ?? 'APIリクエストに失敗しました'
    throw new Error(message)
  }
  return data as Record<string, unknown>
}

function isSupportedHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export type UseGearDeps = {
  accessToken: string | null
  isEditMode: boolean
  isAdminEditing: boolean
  activeLanguage: AppLocale
  requestWithAuth: (url: string, options: RequestInit) => Promise<Record<string, unknown>>
  showToast: (message: string, tone: ToastTone) => void
}

export function useGear(deps: UseGearDeps) {
  const { accessToken, isEditMode, isAdminEditing, activeLanguage, requestWithAuth, showToast } = deps

  const [gearItems, setGearItems] = useState<GearItem[]>([])
  const [isGearLoading, setIsGearLoading] = useState(true)
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [newGearUrl, setNewGearUrl] = useState('')
  const [newGearTitle, setNewGearTitle] = useState('')
  const [newGearDescription, setNewGearDescription] = useState('')
  const [newGearCategory, setNewGearCategory] = useState(DEFAULT_NEW_GEAR_CATEGORY)
  const [newGearImageUrls, setNewGearImageUrls] = useState<string[]>([])
  const [newGearImageCandidates, setNewGearImageCandidates] = useState<string[]>([])
  const [newGearImageUrlInput, setNewGearImageUrlInput] = useState('')
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
  const [visibleGearCount, setVisibleGearCount] = useState(GEAR_PAGE_SIZE)
  const [showBackToPicks, setShowBackToPicks] = useState(false)
  const [gearImageIndexes, setGearImageIndexes] = useState<Record<number, number>>({})
  const [renameCategoryTarget, setRenameCategoryTarget] = useState<string | null>(null)
  const [renameCategoryValue, setRenameCategoryValue] = useState('')
  const [renameCategoryValueEn, setRenameCategoryValueEn] = useState('')
  const [isRenamingCategory, setIsRenamingCategory] = useState(false)
  const [imageSizesByUrl, setImageSizesByUrl] = useState<Record<string, ImageSize>>({})

  const addDialogUrlInputRef = useRef<HTMLInputElement | null>(null)
  const gearCategoryRowRef = useRef<HTMLDivElement | null>(null)
  const gearLoadMoreRef = useRef<HTMLDivElement | null>(null)

  const isModeToggleLocked = isAdding || isFetchingPreview || isUpdating || deletingGearId !== null || isRenamingCategory
  const newGearPrimaryImageUrl = newGearImageUrls[0] ?? null

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

  const visibleFilteredGearItems = useMemo(
    () => filteredGearItems.slice(0, visibleGearCount),
    [filteredGearItems, visibleGearCount],
  )
  const hasMoreFilteredGearItems = visibleGearCount < filteredGearItems.length
  const newGearImageUrlSet = useMemo(() => new Set(newGearImageUrls), [newGearImageUrls])
  const editImageUrlSet = useMemo(() => new Set(editImageUrls), [editImageUrls])

  const draggingGearCategory = useMemo(() => {
    if (draggingGearId === null) {
      return null
    }
    return gearItems.find((item) => item.id === draggingGearId)?.category ?? null
  }, [draggingGearId, gearItems])

  const canReorderCategories = Boolean(isAdminEditing && !isReordering)
  const canReorderCards = Boolean(isAdminEditing && !isReordering)

  const loadGearItems = useCallback(async () => {
    setIsGearLoading(true)
    try {
      const response = await fetch('/api/gear-items')
      const data = await parsePublicApiResponse(response)
      const items = Array.isArray(data.items) ? (data.items as GearItem[]) : []
      setGearItems(sortGearItemsList(items.map(normalizeGearItem)))
    } catch {
      setGearItems(sortGearItemsList(fallbackGearItems))
    } finally {
      setIsGearLoading(false)
    }
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

  const handleGearCardImageError = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    const fallbackImageUrl = '/gear/gaming-pc.jpg'
    if (image.currentSrc.includes(fallbackImageUrl) || image.src.includes(fallbackImageUrl)) {
      return
    }
    image.src = fallbackImageUrl
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
    setNewGearImageUrlInput('')
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
    setNewGearImageUrlInput('')
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
          sortGearItemsList(
            previous.map((entry) =>
              entry.category === oldCategory
                ? { ...entry, category: newCategory, ...(renamedCategoryEn != null ? { categoryEn: renamedCategoryEn } : {}) }
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
      if (!isSupportedHttpUrl(targetUrl)) {
        showToast('http/https のURLを入力してください', 'error')
        return
      }

      setIsFetchingPreview(true)
      try {
        const response = await fetch(`/api/preview?url=${encodeURIComponent(targetUrl)}`)
        const data = await parsePublicApiResponse(response)
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
        setNewGearImageUrlInput('')
        setNewGearImageUrls(mergedImageCandidates.length > 0 ? [mergedImageCandidates[0]] : [])
        setAddDialogStep('edit')
      } catch {
        setNewGearUrl(targetUrl)
        setNewGearTitle('')
        setNewGearDescription('')
        setNewGearCategory(DEFAULT_NEW_GEAR_CATEGORY)
        setNewGearImageCandidates([])
        setNewGearImageUrlInput('')
        setNewGearImageUrls([])
        setAddDialogStep('edit')
        showToast('リンク情報の取得に失敗したため、手入力モードで続行します。', 'info')
      } finally {
        setIsFetchingPreview(false)
      }
    },
    [newGearUrl, showToast],
  )

  const handleToggleNewGearImageUrl = useCallback((url: string) => {
    setNewGearImageUrls((previous) => {
      if (previous.includes(url)) {
        return previous.filter((entry) => entry !== url)
      }
      return [...previous, url]
    })
  }, [])

  const handleAddNewGearImageUrl = useCallback(() => {
    const nextUrl = newGearImageUrlInput.trim()
    if (!nextUrl) {
      return
    }
    try {
      new URL(nextUrl, window.location.origin)
    } catch {
      showToast('画像URLが不正です', 'error')
      return
    }
    setNewGearImageCandidates((previous) => (previous.includes(nextUrl) ? previous : [...previous, nextUrl]))
    setNewGearImageUrls((previous) => (previous.includes(nextUrl) ? previous : [...previous, nextUrl]))
    setNewGearImageUrlInput('')
  }, [newGearImageUrlInput, showToast])

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
        const previousItems = gearItems
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
        const fallbackItems = sortGearItemsList([
          ...previousItems.filter((entry) => entry.id !== normalizedInsertedItem.id),
          normalizedInsertedItem,
        ])
        const nextItems = applyUpdatedGearItemCategorySort(previousItems, normalizedInsertedItem)
        const fallbackOrderedIds = fallbackItems.map((item) => item.id)
        const nextOrderedIds = nextItems.map((item) => item.id)
        const shouldPersistReorder =
          fallbackOrderedIds.length === nextOrderedIds.length &&
          fallbackOrderedIds.some((id, index) => id !== nextOrderedIds[index])

        if (shouldPersistReorder) {
          try {
            await requestWithAuth('/api/admin/gear-items/reorder', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderedIds: nextOrderedIds }),
            })
          } catch (error) {
            setGearItems(fallbackItems)
            const message = error instanceof Error ? error.message : '並び順の保存に失敗しました'
            showToast(`カードは追加しましたが、${message}`, 'error')
            return
          }
        }

        setGearItems(nextItems)
        setNewGearUrl('')
        setNewGearTitle('')
        setNewGearDescription('')
        setNewGearCategory(DEFAULT_NEW_GEAR_CATEGORY)
        setNewGearImageUrls([])
        setNewGearImageCandidates([])
        setNewGearImageUrlInput('')
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
      gearItems,
      newGearCategory,
      newGearDescription,
      newGearImageUrls,
      newGearImageFit,
      newGearTitle,
      newGearUrl,
      requestWithAuth,
      showToast,
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
        const previousItems = gearItems
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
        const mergedUpdatedItem = normalizeGearItem({
          ...(previousItems.find((entry) => entry.id === updatedItem.id) ?? updatedItem),
          ...updatedItem,
        })
        const fallbackItems = sortGearItemsList(
          previousItems.map((entry) => (entry.id === mergedUpdatedItem.id ? mergedUpdatedItem : entry)),
        )
        const nextItems = applyUpdatedGearItemCategorySort(previousItems, mergedUpdatedItem)
        const previousOrderedIds = previousItems.map((item) => item.id)
        const nextOrderedIds = nextItems.map((item) => item.id)
        const shouldPersistReorder =
          previousOrderedIds.length === nextOrderedIds.length &&
          previousOrderedIds.some((id, index) => id !== nextOrderedIds[index])

        if (shouldPersistReorder) {
          try {
            await requestWithAuth('/api/admin/gear-items/reorder', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderedIds: nextOrderedIds }),
            })
          } catch (error) {
            setGearItems(fallbackItems)
            handleCancelEdit()
            const message = error instanceof Error ? error.message : '並び順の保存に失敗しました'
            showToast(`カードは更新しましたが、${message}`, 'error')
            return
          }
        }

        setGearItems(nextItems)
        handleCancelEdit()
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
      gearItems,
      handleCancelEdit,
      showToast,
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
      const data = await parsePublicApiResponse(response)
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
        return
      }
      setEditImageUrls(mergedImageCandidates)
      showToast('候補画像を再取得しました。更新すると反映されます。', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : '候補画像の取得に失敗しました'
      showToast(message, 'error')
    } finally {
      setIsFetchingEditPreview(false)
    }
  }, [editPreviewUrl, showToast])

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

  const handleBackToPicks = useCallback(() => {
    const categoryRow = gearCategoryRowRef.current
    if (!categoryRow) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const nextTop = categoryRow.getBoundingClientRect().top + window.scrollY - 16
    window.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  }, [])

  // Load on mount
  useEffect(() => {
    void loadGearItems()
  }, [loadGearItems])

  // Category filter sync
  useEffect(() => {
    if (selectedCategory === 'all') {
      return
    }
    if (!categoryOptions.includes(selectedCategory)) {
      setSelectedCategory('all')
    }
  }, [categoryOptions, selectedCategory])

  // Reset pagination on filter/data change
  useEffect(() => {
    setVisibleGearCount(GEAR_PAGE_SIZE)
  }, [selectedCategory, gearItems.length])

  // Infinite scroll observer
  useEffect(() => {
    const node = gearLoadMoreRef.current
    if (!node || isGearLoading || !hasMoreFilteredGearItems) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) {
          return
        }
        setVisibleGearCount((previous) => Math.min(previous + GEAR_PAGE_SIZE, filteredGearItems.length))
      },
      { root: null, rootMargin: '240px 0px', threshold: 0.01 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [filteredGearItems.length, hasMoreFilteredGearItems, isGearLoading])

  // Scroll handler for back-to-picks button
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleScroll = () => {
      const categoryRow = gearCategoryRowRef.current
      if (!categoryRow) {
        setShowBackToPicks(window.scrollY > 420)
        return
      }
      const categoryRowOffsetTop = categoryRow.getBoundingClientRect().top + window.scrollY
      setShowBackToPicks(window.scrollY > categoryRowOffsetTop + 280)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Auto-focus URL input when add dialog opens
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

  // Reset editing state when exiting edit mode
  useEffect(() => {
    if (!accessToken || isEditMode) {
      return
    }
    setIsAddFormOpen(false)
    setAddDialogStep('url')
    setNewGearImageUrls([])
    setNewGearImageCandidates([])
    setNewGearImageUrlInput('')
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

  // Reset all gear editing state on logout
  useEffect(() => {
    if (accessToken !== null) {
      return
    }
    setIsAddFormOpen(false)
    setNewGearUrl('')
    setNewGearTitle('')
    setNewGearDescription('')
    setNewGearCategory(DEFAULT_NEW_GEAR_CATEGORY)
    setNewGearImageUrls([])
    setNewGearImageCandidates([])
    setNewGearImageUrlInput('')
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
  }, [accessToken])

  // Sync gear image indexes when items change
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

  return {
    gearItems,
    isGearLoading,
    isAddFormOpen,
    newGearUrl,
    setNewGearUrl,
    newGearTitle,
    setNewGearTitle,
    newGearDescription,
    setNewGearDescription,
    newGearCategory,
    setNewGearCategory,
    newGearImageUrls,
    setNewGearImageUrls,
    newGearImageCandidates,
    newGearImageUrlInput,
    setNewGearImageUrlInput,
    newGearImageFit,
    setNewGearImageFit,
    newGearPrimaryImageUrl,
    newGearImageUrlSet,
    addDialogStep,
    setAddDialogStep,
    isFetchingPreview,
    isAdding,
    deletingGearId,
    deleteConfirmTarget,
    draggingGearId,
    setDraggingGearId,
    dragOverGearId,
    setDragOverGearId,
    draggingCategory,
    setDraggingCategory,
    dragOverCategory,
    setDragOverCategory,
    isReordering,
    editingGearId,
    editTitle,
    setEditTitle,
    editTitleEn,
    setEditTitleEn,
    editDescription,
    setEditDescription,
    editDescriptionEn,
    setEditDescriptionEn,
    editCategory,
    setEditCategory,
    editImageUrls,
    editImageUrlInput,
    setEditImageUrlInput,
    editDraggingImageIndex,
    editDragOverImageIndex,
    editPreviewUrl,
    setEditPreviewUrl,
    editImageCandidates,
    editImageFit,
    setEditImageFit,
    editImageUrlSet,
    isFetchingEditPreview,
    isTranslatingEditDescriptionEn,
    isUpdating,
    selectedCategory,
    setSelectedCategory,
    visibleGearCount,
    showBackToPicks,
    gearImageIndexes,
    renameCategoryTarget,
    renameCategoryValue,
    setRenameCategoryValue,
    renameCategoryValueEn,
    setRenameCategoryValueEn,
    isRenamingCategory,
    imageSizesByUrl,
    addDialogUrlInputRef,
    gearCategoryRowRef,
    gearLoadMoreRef,
    isModeToggleLocked,
    categoryOptions,
    categoryEnByCategory,
    categoryDisplayMap,
    filteredGearItems,
    visibleFilteredGearItems,
    hasMoreFilteredGearItems,
    draggingGearCategory,
    canReorderCategories,
    canReorderCards,
    handlePreviewImageLoad,
    handleGearCardImageError,
    getImageSizeLabel,
    handleOpenAddDialog,
    handleCloseAddDialog,
    handleOpenRenameCategoryDialog,
    handleCloseRenameCategoryDialog,
    handleSubmitRenameCategory,
    handleLoadPreviewForAddDialog,
    handleToggleNewGearImageUrl,
    handleAddNewGearImageUrl,
    handleCreateGearFromUrl,
    handleRequestDeleteGearItem,
    handleCloseDeleteDialog,
    handleConfirmDeleteGearItem,
    handleGearDragStart,
    handleGearDragOver,
    handleGearDrop,
    handleCategoryDragStart,
    handleCategoryDragOver,
    handleCategoryDrop,
    handleStartEditGearItem,
    handleCloseEditDialog,
    handleUpdateGearItem,
    handleTranslateEditDescriptionEn,
    handleAddEditImageUrl,
    handleToggleEditImageUrl,
    handleFetchEditImageCandidates,
    handleRemoveEditImage,
    handlePromoteEditImage,
    handleEditImageDragStart,
    handleEditImageDragOver,
    handleEditImageDrop,
    handleEditImageDragEnd,
    handleSwitchGearImage,
    handleSelectGearImage,
    handleBackToPicks,
  }
}
