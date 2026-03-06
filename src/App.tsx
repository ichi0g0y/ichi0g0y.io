import { ChevronUpIcon, Cross2Icon, EyeOpenIcon, GlobeIcon, MoonIcon, Pencil2Icon, PlusIcon, SunIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useRef } from 'react'

import { AddGearDialog } from './components/AddGearDialog'
import { AuthDialog } from './components/AuthDialog'
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog'
import { EditGearDialog } from './components/EditGearDialog'
import { RenameCategoryDialog } from './components/RenameCategoryDialog'
import { TwitterTemplateDialog } from './components/TwitterTemplateDialog'
import { WithingsSettingsDialog } from './components/WithingsSettingsDialog'
import { WithingsTrendChart } from './components/WithingsTrendChart'
import { IS_LIVE, TWITCH_CHANNEL, links } from './constants'
import { useAuth } from './hooks/useAuth'
import { useGear } from './hooks/useGear'
import { useTheme, type AppLocalePreference, type AppThemePreference } from './hooks/useTheme'
import { useToast } from './hooks/useToast'
import { useTwitter } from './hooks/useTwitter'
import { useTypewriter } from './hooks/useTypewriter'
import { useWithings, formatCalories, formatDistanceMeters, formatDuration, formatWorkoutDetailValue } from './hooks/useWithings'
import { createIntroMessage } from './utils'

function App() {
  const {
    languagePreference,
    setLanguagePreference,
    themePreference,
    setThemePreference,
    activeLanguage,
    activeTheme,
    labels,
  } = useTheme()

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
  const { toast, showToast } = useToast()
  const isTypingDone = typedChars.length >= introChars.length
  const titleAreaRef = useRef<HTMLElement | null>(null)

  const {
    accessToken,
    adminEmail,
    isAuthDialogOpen,
    authMessage,
    isAuthBusy,
    isEditMode,
    setIsEditMode,
    isAdminEditing,
    requestWithAuth,
    handleHiddenTrigger,
    handleCloseAuthDialog,
    handleStartGitHubAuth,
    handleLogout,
  } = useAuth()

  const {
    withingsStatus,
    isWithingsLoading,
    isWithingsConnecting,
    isWithingsSyncing,
    selectedWithingsView,
    setSelectedWithingsView,
    isWithingsSettingsDialogOpen,
    withingsStatusValue,
    latestMeasurement,
    recentWorkouts,
    recentWeights,
    withingsTrendLabels,
    latestWeightLabel,
    latestFatRatioLabel,
    latestBmiLabel,
    latestMeasuredAtLabel,
    withingsConnectedUserLabel,
    withingsLastSyncedLabel,
    formatWithingsMeasuredAt,
    handleWithingsConnect,
    handleWithingsSync,
    handleOpenWithingsSettingsDialog,
    handleCloseWithingsSettingsDialog,
  } = useWithings({
    activeLanguage,
    labels,
    requestWithAuth,
    showToast,
  })

  const {
    twitterStatus,
    isTwitterStatusLoading,
    isTwitterAuthBusy,
    isTwitterTemplateDialogOpen,
    twitterTemplateDraft,
    setTwitterTemplateDraft,
    twitterAutoPostEnabledDraft,
    setTwitterAutoPostEnabledDraft,
    isTwitterTemplateSaving,
    isTwitterTestPosting,
    twitterAccountLabel,
    twitterLastPostedLabel,
    twitterTemplatePlaceholders,
    twitterTemplatePreview,
    twitterChartPreviewUrl,
    setTwitterChartPreviewVersion,
    handleTwitterConnect,
    handleOpenTwitterTemplateDialog,
    handleCloseTwitterTemplateDialog,
    handleInsertTwitterPlaceholder,
    handleSaveTwitterTemplate,
    handleTestTwitterPost,
  } = useTwitter({
    accessToken,
    activeLanguage,
    labels: {
      twitterTemplateAccountEmpty: labels.twitterTemplateAccountEmpty,
      twitterTemplateLastPostedEmpty: labels.twitterTemplateLastPostedEmpty,
    },
    requestWithAuth,
    showToast,
    setIsEditMode,
    latestMeasurement,
    formatWithingsMeasuredAt,
  })

  const {
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
    editCategoryDisplayOptions,
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
  } = useGear({
    accessToken,
    isEditMode,
    isAdminEditing,
    activeLanguage,
    requestWithAuth,
    showToast,
  })

  // Root background color sync
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const titleArea = titleAreaRef.current
    if (!titleArea) {
      return
    }
    const documentElement = window.document.documentElement
    const body = window.document.body
    const updateRootBackground = () => {
      const rootStyle = window.getComputedStyle(documentElement)
      const topBackground = rootStyle.getPropertyValue('--app-top-background').trim()
      const pageBackground = rootStyle.getPropertyValue('--app-page-background').trim()
      const nextBackground = window.scrollY < titleArea.offsetHeight ? topBackground || '#ffffff' : pageBackground || '#efefef'

      documentElement.style.setProperty('--app-root-background', nextBackground)
      body.style.setProperty('--app-root-background', nextBackground)
    }

    updateRootBackground()
    const resizeObserver = new ResizeObserver(() => {
      updateRootBackground()
    })
    resizeObserver.observe(titleArea)
    window.addEventListener('resize', updateRootBackground)
    window.addEventListener('scroll', updateRootBackground, { passive: true })

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateRootBackground)
      window.removeEventListener('scroll', updateRootBackground)
      documentElement.style.removeProperty('--app-root-background')
      body.style.removeProperty('--app-root-background')
    }
  }, [activeTheme])

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

        {isAdminEditing ? (
          <button
            className="mode-toggle-button"
            type="button"
            onClick={handleOpenWithingsSettingsDialog}
            disabled={isWithingsConnecting || isWithingsLoading}
          >
            <span>{labels.withingsSettingsButton}</span>
          </button>
        ) : null}

        {isAdminEditing ? (
          <button
            className="mode-toggle-button"
            type="button"
            onClick={handleOpenTwitterTemplateDialog}
            disabled={isTwitterTemplateSaving || isTwitterStatusLoading}
            aria-label={labels.twitterTemplateEditAria}
          >
            <span>{labels.twitterSettingsButton}</span>
          </button>
        ) : null}

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
      </div>

      <section ref={titleAreaRef} className="title-area" aria-label="profile header">
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

      <section id="weight-graph" className="withings-zone" aria-label="withings">
        <div className="withings-header">
          <h2 className="withings-heading">{labels.withingsHeading}</h2>
          <p className="withings-description">{labels.withingsDescription}</p>
        </div>
        <div className="gear-filter-row">
          <button
            type="button"
            className={`gear-filter-chip${selectedWithingsView === 'weight' ? ' is-active' : ''}`}
            onClick={() => setSelectedWithingsView('weight')}
          >
            {labels.withingsViewWeight}
          </button>
          <button
            type="button"
            className={`gear-filter-chip${selectedWithingsView === 'workout' ? ' is-active' : ''}`}
            onClick={() => setSelectedWithingsView('workout')}
          >
            {labels.withingsViewWorkout}
          </button>
        </div>
        <div className="withings-card">
          {selectedWithingsView === 'weight' && isWithingsLoading ? (
            <div className="withings-loading-skeleton" aria-hidden="true">
              <div className="withings-summary withings-summary-skeleton">
                <p className="withings-summary-item">
                  <span className="withings-skeleton-line is-label" />
                  <span className="withings-skeleton-line is-value" />
                </p>
                <p className="withings-summary-item">
                  <span className="withings-skeleton-line is-label" />
                  <span className="withings-skeleton-line is-value" />
                </p>
                <p className="withings-summary-item">
                  <span className="withings-skeleton-line is-label" />
                  <span className="withings-skeleton-line is-value" />
                </p>
                <p className="withings-summary-item">
                  <span className="withings-skeleton-line is-label" />
                  <span className="withings-skeleton-line is-value" />
                </p>
              </div>
              <div className="withings-trend-skeleton">
                <span className="withings-skeleton-line is-title" />
                <span className="withings-skeleton-line is-chart" />
              </div>
            </div>
          ) : selectedWithingsView === 'weight' ? (
            <>
              <div className="withings-summary">
                <p className="withings-summary-item">
                  <span className="withings-summary-label">{labels.withingsLatestWeightLabel}</span>
                  <span className="withings-metric-value">{latestWeightLabel}</span>
                </p>
                <p className="withings-summary-item">
                  <span className="withings-summary-label">{labels.withingsChartFatRatio}</span>
                  <span className="withings-metric-value">{latestFatRatioLabel}</span>
                </p>
                <p className="withings-summary-item">
                  <span className="withings-summary-label">{labels.withingsChartBmi}</span>
                  <span className="withings-metric-value">{latestBmiLabel}</span>
                </p>
                <p className="withings-summary-item">
                  <span className="withings-summary-label">{labels.withingsLastMeasuredLabel}</span>
                  <span className="withings-metric-value">{latestMeasuredAtLabel}</span>
                </p>
              </div>
              <WithingsTrendChart
                points={recentWeights}
                locale={activeLanguage}
                labels={withingsTrendLabels}
              />
              {latestMeasurement?.measuredAt ? null : <p className="withings-empty-note">{labels.withingsNoMeasurement}</p>}
            </>
          ) : isWithingsLoading ? (
            <p className="withings-empty-note">{labels.withingsLoadingDetail}</p>
          ) : recentWorkouts.length > 0 ? (
            <>
              {recentWorkouts.map((workout, index) => {
                const typeLabel = activeLanguage === 'ja' ? workout.workoutCategoryLabelJa : workout.workoutCategoryLabelEn
                const whenLabel = formatWithingsMeasuredAt(workout.startAt ?? workout.measuredAt)
                const workoutDetails = Array.isArray(workout.details) ? workout.details : []
                const detailByKey = new Map(workoutDetails.map((detail) => [detail.key, detail] as const))
                const caloriesDetail = detailByKey.get('data.manual_calories') ?? detailByKey.get('data.calories')
                const distanceDetail = detailByKey.get('data.manual_distance') ?? detailByKey.get('data.distance')
                const stepsDetail = detailByKey.get('data.steps')
                const durationDetail = detailByKey.get('data.duration')

                const caloriesLabel = caloriesDetail ? formatWorkoutDetailValue(caloriesDetail) : formatCalories(workout.caloriesKcal)
                const distanceLabel = distanceDetail ? formatWorkoutDetailValue(distanceDetail) : formatDistanceMeters(workout.distanceMeters)
                const stepsLabel = stepsDetail
                  ? formatWorkoutDetailValue(stepsDetail)
                  : typeof workout.steps === 'number' && Number.isFinite(workout.steps)
                    ? `${Math.trunc(workout.steps)}`
                    : '-'
                const durationLabel = durationDetail ? formatWorkoutDetailValue(durationDetail) : formatDuration(workout.durationSec)

                return (
                  <div key={`${workout.dataKey}:${index}`} className="withings-metrics withings-workout-metrics">
                    <p className="withings-metric withings-workout-metric">
                      <span className="withings-metric-label withings-workout-label">{labels.withingsWorkoutTypeLabel}</span>
                      <span className="withings-metric-value">{typeLabel}</span>
                    </p>
                    <p className="withings-metric withings-workout-metric">
                      <span className="withings-metric-label withings-workout-label">{labels.withingsWorkoutDateLabel}</span>
                      <span className="withings-metric-value">{whenLabel}</span>
                    </p>
                    <p className="withings-metric withings-workout-metric">
                      <span className="withings-metric-label withings-workout-label">{labels.withingsWorkoutCaloriesLabel}</span>
                      <span className="withings-metric-value">{caloriesLabel}</span>
                    </p>
                    <p className="withings-metric withings-workout-metric">
                      <span className="withings-metric-label withings-workout-label">{labels.withingsWorkoutDurationLabel}</span>
                      <span className="withings-metric-value">{durationLabel}</span>
                    </p>
                    <p className="withings-metric withings-workout-metric">
                      <span className="withings-metric-label withings-workout-label">{labels.withingsWorkoutStepsLabel}</span>
                      <span className="withings-metric-value">{stepsLabel}</span>
                    </p>
                    <p className="withings-metric withings-workout-metric">
                      <span className="withings-metric-label withings-workout-label">{labels.withingsWorkoutDistanceLabel}</span>
                      <span className="withings-metric-value">{distanceLabel}</span>
                    </p>
                  </div>
                )
              })}
            </>
          ) : (
            <p className="withings-empty-note">{labels.withingsNoWorkout}</p>
          )}
        </div>
      </section>

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

        <div ref={gearCategoryRowRef} className="gear-filter-row">
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
          {visibleFilteredGearItems.map((item) => {
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
                  onError={handleGearCardImageError}
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
        {!isGearLoading && hasMoreFilteredGearItems ? <div ref={gearLoadMoreRef} className="gear-load-sentinel" aria-hidden="true" /> : null}
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

      {isAdminEditing ? (
        <WithingsSettingsDialog
          isOpen={isWithingsSettingsDialogOpen}
          isConnecting={isWithingsConnecting}
          isSyncing={isWithingsSyncing}
          title={labels.withingsSettingsDialogTitle}
          description={labels.withingsConnectHint}
          connectLabel={labels.withingsConnectButton}
          syncLabel={labels.withingsSyncButton}
          statusLabel={labels.withingsStatusLabel}
          statusValue={withingsStatusValue}
          userLabel={labels.withingsSettingsUserLabel}
          userValue={withingsConnectedUserLabel}
          lastSyncedLabel={labels.withingsSettingsLastSyncedLabel}
          lastSyncedValue={withingsLastSyncedLabel}
          onClose={handleCloseWithingsSettingsDialog}
          onConnect={() => {
            void handleWithingsConnect()
          }}
          onSync={() => {
            void handleWithingsSync()
          }}
          canSync={Boolean(withingsStatus?.connected)}
        />
      ) : null}

      {isAdminEditing ? (
        <TwitterTemplateDialog
          isOpen={isTwitterTemplateDialogOpen}
          isSaving={isTwitterTemplateSaving}
          isConnecting={isTwitterAuthBusy}
          isTesting={isTwitterTestPosting}
          title={labels.twitterTemplateDialogTitle}
          description={labels.twitterTemplateDescription}
          autoPostLabel={labels.twitterAutoPostLabel}
          autoPostEnabled={twitterAutoPostEnabledDraft}
          templateLabel={labels.twitterTemplateLabel}
          placeholderTitle={labels.twitterTemplatePlaceholderTitle}
          previewTitle={labels.twitterTemplatePreviewTitle}
          chartPreviewTitle={labels.twitterTemplateChartPreviewTitle}
          chartPreviewEmpty={labels.twitterTemplateChartPreviewEmpty}
          chartPreviewRefreshLabel={labels.twitterTemplateChartPreviewRefresh}
          saveLabel={isTwitterTemplateSaving ? labels.twitterTemplateSaving : labels.twitterTemplateSave}
          connectLabel={
            isTwitterAuthBusy
              ? labels.twitterConnectingButton
              : twitterStatus?.connected
                ? labels.twitterTemplateReauthorize
                : labels.twitterTemplateReconnect
          }
          testLabel={isTwitterTestPosting ? labels.twitterTemplateTesting : labels.twitterTemplateTest}
          accountLabel={labels.twitterTemplateAccountLabel}
          accountValue={twitterAccountLabel}
          lastPostedLabel={labels.twitterTemplateLastPostedLabel}
          lastPostedValue={twitterLastPostedLabel}
          template={twitterTemplateDraft}
          preview={twitterTemplatePreview}
          chartPreviewUrl={twitterChartPreviewUrl}
          placeholders={twitterTemplatePlaceholders}
          onClose={handleCloseTwitterTemplateDialog}
          onSubmit={handleSaveTwitterTemplate}
          onConnect={() => {
            void handleTwitterConnect()
          }}
          onTestPost={() => {
            void handleTestTwitterPost()
          }}
          onSetAutoPostEnabled={setTwitterAutoPostEnabledDraft}
          onSetTemplate={setTwitterTemplateDraft}
          onInsertPlaceholder={handleInsertTwitterPlaceholder}
          onRefreshChartPreview={() => {
            setTwitterChartPreviewVersion(Date.now())
          }}
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

      <button
        type="button"
        className={`back-to-picks${showBackToPicks ? ' is-visible' : ''}`}
        onClick={handleBackToPicks}
        aria-label={activeLanguage === 'en' ? 'Back to Picks categories' : 'Picksカテゴリに戻る'}
      >
        <ChevronUpIcon />
      </button>

      <footer className="copyright">Copyright &copy; {new Date().getFullYear()} ichi0g0y</footer>
    </main>
  )
}

export default App
