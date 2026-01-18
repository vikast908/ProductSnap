import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X, ExternalLink, ChevronLeft, ChevronRight,
  Type, Clock, User, Globe
} from 'lucide-react'

const FONT_SIZES = ['base', 'lg', 'xl']

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
  const [fontSize, setFontSize] = useState('lg')

  // Fetch article content
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

        if (!response.ok) throw new Error('Failed to extract article content')

        const data = await response.json()
        setContent(data)
      } catch (err) {
        if (err.name === 'AbortError') return
        setError(err.message)
      } finally {
        if (!abortController.signal.aborted) setLoading(false)
      }
    }

    fetchContent()
    return () => abortController.abort()
  }, [article?.link])

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowLeft' && hasPrev) onPrev()
    else if (e.key === 'ArrowRight' && hasNext) onNext()
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const cycleFontSize = useCallback(() => {
    setFontSize(prev => {
      const idx = FONT_SIZES.indexOf(prev)
      return FONT_SIZES[(idx + 1) % FONT_SIZES.length]
    })
  }, [])

  const formattedDate = useMemo(() => {
    if (!article?.pubDate) return ''
    return new Date(article.pubDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }, [article?.pubDate])

  const readTime = useMemo(() => {
    if (!content?.textContent) return ''
    const words = content.textContent.split(/\s+/).length
    return `${Math.max(1, Math.ceil(words / 200))} min read`
  }, [content?.textContent])

  const fontSizeClass = {
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  }[fontSize]

  const titleSize = {
    base: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl'
  }[fontSize]

  if (!article) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background w-full h-full md:h-[95vh] md:max-w-4xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrev}
              disabled={!hasPrev}
              className="h-9 w-9"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!hasNext}
              className="h-9 w-9"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={cycleFontSize}
              className="h-9 px-3 text-muted-foreground"
            >
              <Type className="h-4 w-4 mr-1.5" />
              <span className="text-xs font-medium uppercase">{fontSize}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open(article.link, '_blank')}
              className="h-9 w-9"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Content */}
        <ScrollArea className="flex-1">
          <article className="max-w-2xl mx-auto px-6 py-10">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-muted-foreground">
              <Badge variant="secondary">{article.category}</Badge>
              {readTime && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {readTime}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className={`${titleSize} font-semibold tracking-tight leading-tight mb-6`}>
              {content?.title || article.title}
            </h1>

            {/* Author / Source */}
            <div className={`flex flex-wrap items-center gap-4 mb-10 text-muted-foreground ${fontSizeClass}`}>
              {(article.author || content?.byline) && (
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {article.author || content?.byline}
                </span>
              )}
              {formattedDate && <span>{formattedDate}</span>}
              {(article.feedName || content?.siteName) && (
                <span className="flex items-center gap-1.5">
                  <Globe className="h-4 w-4" />
                  {article.feedName || content?.siteName}
                </span>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center py-20">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground">Loading article...</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-center py-20">
                <p className="text-destructive mb-2">Failed to load article</p>
                <p className="text-muted-foreground text-sm mb-6">{error}</p>
                <Button onClick={() => window.open(article.link, '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Original
                </Button>
              </div>
            )}

            {/* Content */}
            {!loading && !error && content && (
              <>
                {content.excerpt && (
                  <p className={`text-muted-foreground leading-relaxed mb-10 ${fontSizeClass}`}>
                    {content.excerpt}
                  </p>
                )}
                <div
                  className={`article-reader-content ${fontSizeClass}`}
                  dangerouslySetInnerHTML={{ __html: content.content }}
                />
              </>
            )}

            {/* Fallback */}
            {!loading && !error && !content && article.description && (
              <div className={`leading-relaxed ${fontSizeClass}`}>
                <p className="mb-8">{article.description}</p>
                <Button onClick={() => window.open(article.link, '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Read Full Article
                </Button>
              </div>
            )}
          </article>
        </ScrollArea>

        {/* Footer */}
        <footer className="flex items-center justify-between px-6 h-12 border-t border-border/50 text-xs text-muted-foreground flex-shrink-0">
          <div className="flex items-center gap-4">
            <span>Esc to close</span>
            <span>← → to navigate</span>
          </div>
          <button
            onClick={() => window.open(article.link, '_blank')}
            className="hover:text-foreground transition-colors"
          >
            View Original →
          </button>
        </footer>
      </div>
    </div>
  )
}
