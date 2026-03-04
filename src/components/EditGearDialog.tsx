import { Cross2Icon } from '@radix-ui/react-icons'
import type { DragEvent, FormEvent, SyntheticEvent } from 'react'

import type { GearItem, ImageSize } from '../types'
import { ImageFitSwitch } from './ImageFitSwitch'

export type EditGearDialogProps = {
  editTitle: string
  editTitleEn: string
  editDescription: string
  editDescriptionEn: string
  editCategory: string
  editCategoryLabel: string
  categoryDisplayOptions: Array<{ value: string; label: string }>
  editImageUrls: string[]
  editImageUrlInput: string
  editImageCandidates: string[]
  editImageFit: GearItem['imageFit']
  editImageUrlSet: Set<string>
  editPreviewUrl: string
  editDraggingImageIndex: number | null
  editDragOverImageIndex: number | null
  isUpdating: boolean
  isFetchingEditPreview: boolean
  imageSizesByUrl: Record<string, ImageSize>
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSetEditTitle: (value: string) => void
  onSetEditTitleEn: (value: string) => void
  onSetEditDescription: (value: string) => void
  onSetEditDescriptionEn: (value: string) => void
  onSetEditCategory: (value: string) => void
  isTranslatingEditDescriptionEn: boolean
  onTranslateEditDescriptionEn: () => void
  onSetEditImageUrlInput: (value: string) => void
  onSetEditPreviewUrl: (value: string) => void
  onSetEditImageFit: (value: GearItem['imageFit']) => void
  onAddEditImageUrl: () => void
  onToggleEditImageUrl: (url: string) => void
  onFetchEditImageCandidates: () => void
  onRemoveEditImage: (index: number) => void
  onPromoteEditImage: (index: number) => void
  onEditImageDragStart: (event: DragEvent<HTMLDivElement>, sourceIndex: number) => void
  onEditImageDragOver: (event: DragEvent<HTMLDivElement>, targetIndex: number) => void
  onEditImageDrop: (event: DragEvent<HTMLDivElement>, targetIndex: number) => void
  onEditImageDragEnd: () => void
  onPreviewImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void
  getImageSizeLabel: (url: string) => string
}

export function EditGearDialog({
  editTitle,
  editTitleEn,
  editDescription,
  editDescriptionEn,
  editCategory,
  editCategoryLabel,
  categoryDisplayOptions,
  editImageUrls,
  editImageUrlInput,
  editImageCandidates,
  editImageFit,
  editImageUrlSet,
  editPreviewUrl,
  editDraggingImageIndex,
  editDragOverImageIndex,
  isUpdating,
  isFetchingEditPreview,
  onClose,
  onSubmit,
  onSetEditTitle,
  onSetEditTitleEn,
  onSetEditDescription,
  onSetEditDescriptionEn,
  onSetEditCategory,
  isTranslatingEditDescriptionEn,
  onTranslateEditDescriptionEn,
  onSetEditImageUrlInput,
  onSetEditPreviewUrl,
  onSetEditImageFit,
  onAddEditImageUrl,
  onToggleEditImageUrl,
  onFetchEditImageCandidates,
  onRemoveEditImage,
  onPromoteEditImage,
  onEditImageDragStart,
  onEditImageDragOver,
  onEditImageDrop,
  onEditImageDragEnd,
  onPreviewImageLoad,
  getImageSizeLabel,
}: EditGearDialogProps) {
  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
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
            onClick={onClose}
            disabled={isUpdating}
            aria-label="閉じる"
          >
            <Cross2Icon />
          </button>
        </div>

        <form className="admin-form add-form" onSubmit={onSubmit}>
          <label className="admin-label">
            タイトル（日本語）
            <input
              className="admin-input"
              type="text"
              value={editTitle}
              onChange={(event) => onSetEditTitle(event.target.value)}
              placeholder="カードタイトル"
              required
            />
          </label>
          <label className="admin-label">
            タイトル（英語）
            <input
              className="admin-input"
              type="text"
              value={editTitleEn}
              onChange={(event) => onSetEditTitleEn(event.target.value)}
              placeholder="Card title (English)"
            />
          </label>
          <label className="admin-label">
            説明（日本語）
            <textarea
              className="admin-textarea"
              value={editDescription}
              onChange={(event) => onSetEditDescription(event.target.value)}
              placeholder="説明文"
            />
          </label>
          <label className="admin-label">
            <span className="admin-label-row">
              <span>説明（英語）</span>
              <button
                className="admin-button ghost admin-inline-button"
                type="button"
                onClick={onTranslateEditDescriptionEn}
                disabled={isUpdating || isTranslatingEditDescriptionEn || editDescription.trim().length < 1}
              >
                {isTranslatingEditDescriptionEn ? '翻訳中...' : '日本語から英訳'}
              </button>
            </span>
            <textarea
              className="admin-textarea"
              value={editDescriptionEn}
              onChange={(event) => onSetEditDescriptionEn(event.target.value)}
              placeholder="Description (English)"
            />
          </label>
          <label className="admin-label">
            カテゴリ
            <select
              className="admin-select"
              value={editCategory}
              onChange={(event) => onSetEditCategory(event.target.value)}
              aria-label="カテゴリ選択"
            >
              {categoryDisplayOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="add-dialog-note">選択中: {editCategoryLabel}</p>
          <label className="admin-label">
            画像（任意）
            <div className="edit-image-fetch-row">
              <input
                className="admin-input"
                type="url"
                value={editPreviewUrl}
                onChange={(event) => onSetEditPreviewUrl(event.target.value)}
                placeholder="候補取得元URL（https://...）"
              />
              <button
                className="admin-button ghost"
                type="button"
                onClick={() => {
                  void onFetchEditImageCandidates()
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
                      onClick={() => onToggleEditImageUrl(candidateUrl)}
                      aria-label={`候補画像 ${index + 1} を${editImageUrlSet.has(candidateUrl) ? '解除' : '選択'}`}
                    >
                      <img
                        src={candidateUrl}
                        alt={`候補画像 ${index + 1}`}
                        loading="lazy"
                        className={editImageFit === 'contain' ? 'is-contain' : ''}
                        data-size-key={candidateUrl}
                        onLoad={onPreviewImageLoad}
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
                onChange={(event) => onSetEditImageUrlInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onAddEditImageUrl()
                  }
                }}
                placeholder="https://..."
              />
              <button
                className="admin-button ghost"
                type="button"
                onClick={onAddEditImageUrl}
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
                    onDragStart={(event) => onEditImageDragStart(event, index)}
                    onDragOver={(event) => onEditImageDragOver(event, index)}
                    onDrop={(event) => onEditImageDrop(event, index)}
                    onDragEnd={onEditImageDragEnd}
                  >
                    <button
                      type="button"
                      className={`edit-image-thumb${editImageFit === 'contain' ? ' is-contain' : ''}`}
                      onClick={() => onPromoteEditImage(index)}
                      disabled={index === 0 || isUpdating}
                      aria-label={index === 0 ? 'メイン画像' : `${index + 1}枚目をメイン画像にする`}
                    >
                      <img
                        src={url}
                        alt={`編集画像 ${index + 1}`}
                        loading="lazy"
                        className={editImageFit === 'contain' ? 'is-contain' : ''}
                        data-size-key={url}
                        onLoad={onPreviewImageLoad}
                      />
                      {getImageSizeLabel(url) ? <span className="preview-image-size">{getImageSizeLabel(url)}</span> : null}
                    </button>
                    <div className="edit-image-actions">
                      <button
                        className="admin-button ghost"
                        type="button"
                        onClick={() => onPromoteEditImage(index)}
                        disabled={index === 0 || isUpdating}
                      >
                        先頭にする
                      </button>
                      <button
                        className="admin-button danger"
                        type="button"
                        onClick={() => onRemoveEditImage(index)}
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
                onCheckedChange={(nextChecked) => onSetEditImageFit(nextChecked ? 'contain' : 'cover')}
              />
            </div>
          </label>
          <div className="admin-form-actions">
            <button className="admin-button ghost" type="button" onClick={onClose} disabled={isUpdating}>
              キャンセル
            </button>
            <button className="admin-button" type="submit" disabled={isUpdating}>
              {isUpdating ? '更新中...' : 'カード更新'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
