import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X, ExternalLink, ChevronLeft, ChevronRight,
  Type, Clock, User, Globe, AlertCircle, Archive, FileText
} from 'lucide-react'

// Error code to user-friendly title mapping
const ERROR_TITLES = {
  TIMEOUT: 'Website Took Too Long',
  ACCESS_DENIED: 'Access Restricted',
  NOT_FOUND: 'Article Not Found',
  RATE_LIMITED: 'Too Many Requests',
  SITE_ERROR: 'Website Unavailable',
  FETCH_FAILED: 'Connection Failed',
  PARSE_FAILED: 'Content Extraction Failed',
  INSUFFICIENT_CONTENT: 'Limited Content Available',
  UNKNOWN_ERROR: 'Something Went Wrong'
}

// Alternative reading services (free, no API key needed)
const getAlternativeLinks = (url) => {
  const encoded = encodeURIComponent(url)
  return [
    {
      name: 'Archive.today',
      url: `https://archive.today/?run=1&url=${encoded}`,
      description: 'View cached version'
    },
    {
      name: '12ft Ladder',
      url: `https://12ft.io/${url}`,
      description: 'Try to bypass paywall'
    },
    {
      name: 'Google Cache',
      url: `https://webcache.googleusercontent.com/search?q=cache:${encoded}`,
      description: 'View Google\'s cached copy'
    }
  ]
}

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
  const [errorDetails, setErrorDetails] = useState(null)
  const [fontSize, setFontSize] = useState('lg')

  // Fetch article content
  useEffect(() => {
    if (!article?.link) return

    const abortController = new AbortController()

    const fetchContent = async () => {
      setLoading(true)
      setError(null)
      setErrorDetails(null)

      try {
        const response = await fetch(
          `/api/extract?url=${encodeURIComponent(article.link)}`,
          { signal: abortController.signal }
        )

        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Failed to extract article content')
          setErrorDetails({
            errorCode: data.errorCode || 'UNKNOWN_ERROR',
            canUseAlternative: data.canUseAlternative ?? true,
            siteInfo: data.siteInfo || null
          })
          return
        }

        setContent(data)
      } catch (err) {
        if (err.name === 'AbortError') return
        setError('Unable to connect to the server. Please check your connection.')
        setErrorDetails({
          errorCode: 'NETWORK_ERROR',
          canUseAlternative: true,
          siteInfo: null
        })
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
              <div className="py-12">
                {/* Error Header */}
                <div className="flex flex-col items-center mb-8">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                  <h3 className="text-xl font-semibold text-destructive mb-2">
                    {ERROR_TITLES[errorDetails?.errorCode] || 'Failed to Load Article'}
                  </h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    {error}
                  </p>
                </div>

                {/* Primary Action */}
                <div className="flex justify-center mb-8">
                  <Button
                    size="lg"
                    onClick={() => window.open(article.link, '_blank')}
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Original Article
                  </Button>
                </div>

                {/* Alternative Reading Options */}
                {errorDetails?.canUseAlternative && (
                  <div className="border-t border-border pt-8">
                    <h4 className="text-sm font-medium text-center text-muted-foreground mb-4">
                      Try reading on a different site
                    </h4>
                    <div className="flex flex-wrap justify-center gap-3">
                      {getAlternativeLinks(article.link).map((alt) => (
                        <Button
                          key={alt.name}
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(alt.url, '_blank')}
                          className="gap-2"
                          title={alt.description}
                        >
                          {alt.name === 'Archive.today' && <Archive className="h-4 w-4" />}
                          {alt.name === '12ft Ladder' && <FileText className="h-4 w-4" />}
                          {alt.name === 'Google Cache' && <Globe className="h-4 w-4" />}
                          {alt.name}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-4">
                      These services may help bypass paywalls or show cached versions of the article.
                    </p>
                  </div>
                )}

                {/* Explanation for specific site issues */}
                {errorDetails?.siteInfo && (
                  <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Why this happens:</span>{' '}
                      {errorDetails.siteInfo.reason === 'paywall' && 'This site uses a paywall to restrict access to content.'}
                      {errorDetails.siteInfo.reason === 'auth_required' && 'This site requires you to be logged in to view content.'}
                      {errorDetails.siteInfo.reason === 'javascript_required' && 'This site requires JavaScript to display content, which our reader cannot process.'}
                    </p>
                  </div>
                )}
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
