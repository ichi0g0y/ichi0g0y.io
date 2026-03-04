import { Cross2Icon } from '@radix-ui/react-icons'
import type { FormEvent, RefObject, SyntheticEvent } from 'react'

import type { AddDialogStep, GearItem, ImageSize } from '../types'
import { CategoryCommandField } from './CategoryCommandField'
import { ImageFitSwitch } from './ImageFitSwitch'

export type AddGearDialogProps = {
  addDialogStep: AddDialogStep
  newGearUrl: string
  newGearTitle: string
  newGearDescription: string
  newGearCategory: string
  newGearImageUrls: string[]
  newGearImageCandidates: string[]
  newGearImageFit: GearItem['imageFit']
  newGearImageUrlSet: Set<string>
  newGearPrimaryImageUrl: string | null
  categoryOptions: string[]
  isFetchingPreview: boolean
  isAdding: boolean
  imageSizesByUrl: Record<string, ImageSize>
  addDialogUrlInputRef: RefObject<HTMLInputElement | null>
  onClose: () => void
  onSetNewGearUrl: (value: string) => void
  onSetNewGearTitle: (value: string) => void
  onSetNewGearDescription: (value: string) => void
  onSetNewGearCategory: (value: string) => void
  onSetNewGearImageUrls: (value: string[]) => void
  onSetNewGearImageFit: (value: GearItem['imageFit']) => void
  onSetAddDialogStep: (value: AddDialogStep) => void
  onLoadPreview: (event: FormEvent<HTMLFormElement>) => void
  onCreateGear: (event: FormEvent<HTMLFormElement>) => void
  onToggleImageUrl: (url: string) => void
  onPreviewImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void
  getImageSizeLabel: (url: string) => string
}

export function AddGearDialog({
  addDialogStep,
  newGearUrl,
  newGearTitle,
  newGearDescription,
  newGearCategory,
  newGearImageUrls,
  newGearImageCandidates,
  newGearImageFit,
  newGearImageUrlSet,
  newGearPrimaryImageUrl,
  categoryOptions,
  isFetchingPreview,
  isAdding,
  addDialogUrlInputRef,
  onClose,
  onSetNewGearUrl,
  onSetNewGearTitle,
  onSetNewGearDescription,
  onSetNewGearCategory,
  onSetNewGearImageUrls,
  onSetNewGearImageFit,
  onSetAddDialogStep,
  onLoadPreview,
  onCreateGear,
  onToggleImageUrl,
  onPreviewImageLoad,
  getImageSizeLabel,
}: AddGearDialogProps) {
  return (
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
            onClick={onClose}
            disabled={isAdding || isFetchingPreview}
            aria-label="閉じる"
          >
            <Cross2Icon />
          </button>
        </div>

        {addDialogStep === 'url' ? (
          <form className="admin-form add-form" onSubmit={onLoadPreview}>
            <label className="admin-label">
              URL
              <input
                ref={addDialogUrlInputRef}
                className="admin-input"
                type="url"
                value={newGearUrl}
                onChange={(event) => onSetNewGearUrl(event.target.value)}
                placeholder="https://..."
                required
              />
            </label>
            <p className="add-dialog-note">次へを押すとリンク情報を取得し、編集画面へ進みます。</p>
            <div className="admin-form-actions">
              <button className="admin-button ghost" type="button" onClick={onClose} disabled={isFetchingPreview}>
                キャンセル
              </button>
              <button className="admin-button" type="submit" disabled={isFetchingPreview}>
                {isFetchingPreview ? '取得中...' : '次へ'}
              </button>
            </div>
          </form>
        ) : (
          <form className="admin-form add-form" onSubmit={onCreateGear}>
            <label className="admin-label">
              URL
              <input
                className="admin-input"
                type="url"
                value={newGearUrl}
                onChange={(event) => onSetNewGearUrl(event.target.value)}
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
                onChange={(event) => onSetNewGearTitle(event.target.value)}
                placeholder="カードタイトル"
              />
            </label>
            <label className="admin-label">
              説明（任意）
              <textarea
                className="admin-textarea"
                value={newGearDescription}
                onChange={(event) => onSetNewGearDescription(event.target.value)}
                placeholder="説明文"
              />
            </label>
            <label className="admin-label">
              カテゴリ
              <CategoryCommandField
                value={newGearCategory}
                options={categoryOptions}
                onValueChange={onSetNewGearCategory}
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
                    onLoad={onPreviewImageLoad}
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
                      onClick={() => onToggleImageUrl(candidateUrl)}
                      aria-label={`候補画像 ${index + 1} を${newGearImageUrlSet.has(candidateUrl) ? '解除' : '選択'}`}
                    >
                      <img
                        src={candidateUrl}
                        alt={`候補画像 ${index + 1}`}
                        loading="lazy"
                        className={newGearImageFit === 'contain' ? 'is-contain' : ''}
                        data-size-key={candidateUrl}
                        onLoad={onPreviewImageLoad}
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
              onClick={() => onSetNewGearImageUrls([])}
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
                  onCheckedChange={(nextChecked) => onSetNewGearImageFit(nextChecked ? 'contain' : 'cover')}
                />
              </div>
            </label>
            <div className="admin-form-actions">
              <button
                className="admin-button ghost"
                type="button"
                onClick={() => onSetAddDialogStep('url')}
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
  )
}
