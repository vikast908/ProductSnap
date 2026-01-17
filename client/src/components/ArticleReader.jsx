import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Type,
  Sun,
  Moon,
  BookOpen,
  Clock,
  User,
  Globe
} from 'lucide-react'

// Constants defined outside component to prevent recreation
const FONT_SIZES = ['sm', 'base', 'lg', 'xl']
const READING_MODES = ['light', 'sepia', 'dark']
const FONT_SIZE_CLASSES = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl'
}

export function ArticleReader({
  article,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev
}) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fontSize, setFontSize] = useState('base')
  const [readingMode, setReadingMode] = useState('light')

  // Fetch article content with AbortController for cleanup
  useEffect(() => {
    if (!article?.link) return

    const abortController = new AbortController()

    const fetchContent = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/extract?url=${encodeURIComponent(article.link)}`,
          { signal: abortController.signal }
        )

        if (!response.ok) {
          throw new Error('Failed to extract article content')
        }

        const data = await response.json()
        setContent(data)
      } catch (err) {
        // Don't set error for aborted requests
        if (err.name === 'AbortError') return
        console.error('Error fetching article:', err)
        setError(err.message)
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchContent()

    // Cleanup: abort fetch if component unmounts or article changes
    return () => abortController.abort()
  }, [article?.link])

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowLeft' && hasPrev) {
      onPrev()
    } else if (e.key === 'ArrowRight' && hasNext) {
      onNext()
    }
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when reader is open
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  // Memoized handlers to prevent unnecessary re-renders
  const cycleFontSize = useCallback(() => {
    setFontSize(prev => {
      const currentIndex = FONT_SIZES.indexOf(prev)
      return FONT_SIZES[(currentIndex + 1) % FONT_SIZES.length]
    })
  }, [])

  const cycleReadingMode = useCallback(() => {
    setReadingMode(prev => {
      const currentIndex = READING_MODES.indexOf(prev)
      return READING_MODES[(currentIndex + 1) % READING_MODES.length]
    })
  }, [])

  const openExternalLink = useCallback(() => {
    window.open(article.link, '_blank')
  }, [article?.link])

  // Memoized computed values
  const readingModeClasses = useMemo(() => {
    switch (readingMode) {
      case 'sepia': return 'bg-amber-50 text-amber-950'
      case 'dark': return 'bg-slate-900 text-slate-100'
      default: return 'bg-white text-slate-900'
    }
  }, [readingMode])

  const toolbarClasses = useMemo(() => {
    switch (readingMode) {
      case 'dark': return 'border-slate-700 bg-slate-800'
      case 'sepia': return 'border-amber-200 bg-amber-100'
      default: return 'border-gray-200 bg-gray-50'
    }
  }, [readingMode])

  const readingModeIcon = useMemo(() => {
    switch (readingMode) {
      case 'sepia': return <BookOpen className="h-4 w-4" />
      case 'dark': return <Moon className="h-4 w-4" />
      default: return <Sun className="h-4 w-4" />
    }
  }, [readingMode])

  // Memoized formatted date
  const formattedDate = useMemo(() => {
    if (!article?.pubDate) return ''
    return new Date(article.pubDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }, [article?.pubDate])

  // Memoized reading time estimate
  const readTime = useMemo(() => {
    if (!content?.textContent) return ''
    const words = content.textContent.split(/\s+/).length
    const minutes = Math.max(1, Math.ceil(words / 200))
    return `${minutes} min read`
  }, [content?.textContent])

  if (!article) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Reader Modal */}
      <div className={`relative flex flex-col h-full max-w-4xl mx-auto w-full shadow-2xl ${readingModeClasses}`}>
        {/* Toolbar */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${toolbarClasses}`}>
          <div className="flex items-center gap-2">
            {/* Navigation */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrev}
              disabled={!hasPrev}
              className="h-8 w-8"
              title="Previous article (←)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!hasNext}
              className="h-8 w-8"
              title="Next article (→)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* Font Size */}
            <Button
              variant="ghost"
              size="sm"
              onClick={cycleFontSize}
              className="h-8 px-3"
              title={`Font size: ${fontSize}`}
            >
              <Type className="h-4 w-4 mr-1" />
              <span className="text-xs uppercase">{fontSize}</span>
            </Button>

            {/* Reading Mode */}
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleReadingMode}
              className="h-8 w-8"
              title={`Reading mode: ${readingMode}`}
            >
              {readingModeIcon}
            </Button>

            {/* External Link */}
            <Button
              variant="ghost"
              size="icon"
              onClick={openExternalLink}
              className="h-8 w-8"
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>

            {/* Close */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Article Header */}
            <header className="mb-8">
              {/* Category & Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge>{article.category}</Badge>
                {readTime && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {readTime}
                  </Badge>
                )}
              </div>

              {/* Title */}
              <h1 className={`font-bold leading-tight mb-4 ${fontSize === 'xl' ? 'text-4xl' : fontSize === 'lg' ? 'text-3xl' : fontSize === 'base' ? 'text-2xl' : 'text-xl'}`}>
                {content?.title || article.title}
              </h1>

              {/* Byline */}
              <div className={`flex flex-wrap items-center gap-4 text-muted-foreground ${FONT_SIZE_CLASSES[fontSize]}`}>
                {(article.author || content?.byline) && (
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {article.author || content?.byline}
                  </span>
                )}
                {formattedDate && (
                  <span>{formattedDate}</span>
                )}
                {(article.feedName || content?.siteName) && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    {article.feedName || content?.siteName}
                  </span>
                )}
              </div>
            </header>

            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="relative w-12 h-12 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                </div>
                <p className="text-muted-foreground">Loading article content...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-20">
                <p className="text-destructive mb-4">Failed to load article content</p>
                <p className="text-muted-foreground mb-6">{error}</p>
                <Button onClick={openExternalLink}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Original Article
                </Button>
              </div>
            )}

            {/* Article Content */}
            {!loading && !error && content && (
              <>
                {/* Excerpt */}
                {content.excerpt && (
                  <p className={`text-muted-foreground italic mb-8 leading-relaxed ${FONT_SIZE_CLASSES[fontSize]}`}>
                    {content.excerpt}
                  </p>
                )}

                {/* Full Content */}
                <div
                  className={`article-reader-content prose max-w-none ${FONT_SIZE_CLASSES[fontSize]} ${readingMode === 'dark' ? 'prose-invert' : ''}`}
                  dangerouslySetInnerHTML={{ __html: content.content }}
                />
              </>
            )}

            {/* Fallback to description if no content */}
            {!loading && !error && !content && article.description && (
              <div className={`leading-relaxed ${FONT_SIZE_CLASSES[fontSize]}`}>
                <p className="mb-6">{article.description}</p>
                <Button onClick={openExternalLink}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Read Full Article
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className={`flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground ${toolbarClasses}`}>
          <div className="flex items-center gap-4">
            <span>Esc to close</span>
            <span>← → to navigate</span>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={openExternalLink}
            className="text-xs h-auto p-0"
          >
            View Original →
          </Button>
        </div>
      </div>
    </div>
  )
}
