export type GearItem = {
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

export type ToastTone = 'success' | 'error' | 'info'
export type AddDialogStep = 'url' | 'edit'

export type LinkPreviewData = {
  url?: string
  title?: string | null
  description?: string | null
  imageUrl?: string | null
  imageCandidates?: string[]
}

export type ToastState = {
  id: number
  message: string
  tone: ToastTone
}

export type ImageSize = {
  width: number
  height: number
}

export type AppLocale = 'ja' | 'en'
