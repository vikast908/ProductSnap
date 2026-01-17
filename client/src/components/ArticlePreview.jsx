import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, ExternalLink, X, BookOpen, Clock, AlertCircle } from 'lucide-react'

export function ArticlePreview({ articleUrl, onClose }) {
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/extract?url=${encodeURIComponent(articleUrl)}`)

        if (!response.ok) {
          throw new Error('Failed to fetch article')
        }

        const data = await response.json()
        setContent(data)
        setError(null)
      } catch (err) {
        setError('Failed to load article preview')
        console.error('Error fetching article:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchArticle()
  }, [articleUrl])

  const estimateReadTime = (charCount) => {
    const wordsPerMinute = 200
    const words = charCount / 5 // Average word length
    const minutes = Math.ceil(words / wordsPerMinute)
    return minutes
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-6 bg-gradient-to-br from-background to-muted/20">
        <div className="relative">
          <div className="absolute inset-0 animate-ping">
            <BookOpen className="h-12 w-12 text-primary/20" />
          </div>
          <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-base font-medium">Loading Preview</p>
          <p className="text-sm text-muted-foreground">Fetching article content...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-start gap-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <h3 className="font-semibold text-destructive">Preview Unavailable</h3>
            <p className="text-sm text-muted-foreground">
              We couldn't load a preview for this article. This might happen if the website blocks automated access.
            </p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button
          onClick={() => window.open(articleUrl, '_blank')}
          className="w-full"
          size="lg"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open Full Article in New Tab
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full max-h-[600px]">
      {/* Header */}
      <div className="flex-shrink-0 p-6 pb-4 bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 border-b">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <h3 className="font-bold text-xl leading-tight line-clamp-2">
              {content?.title}
            </h3>
            {content?.byline && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5" />
                {content.byline}
              </p>
            )}
            {content?.length && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {estimateReadTime(content.length)} min read · {Math.round(content.length / 1000)}k characters
              </p>
            )}
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="flex-shrink-0 hover:bg-background/80"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 px-6">
        <div className="py-6 space-y-4">
          {content?.excerpt && (
            <div className="p-4 bg-accent/10 border-l-4 border-accent rounded-r-lg">
              <p className="text-sm italic leading-relaxed text-foreground/90">
                {content.excerpt}
              </p>
            </div>
          )}
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: content?.content || '' }}
          />
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t bg-muted/30">
        <Button
          onClick={() => window.open(articleUrl, '_blank')}
          className="w-full"
          size="lg"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Continue Reading on Website
        </Button>
      </div>
    </div>
  )
}
