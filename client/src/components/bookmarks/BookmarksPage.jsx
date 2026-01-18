import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Bookmark, ArrowLeft, Trash2, ExternalLink, Mic, FileText,
  Download, Search, X, Clock, StickyNote
} from 'lucide-react'

export function BookmarksPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user, token } = useAuth()
  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/')
      return
    }
    fetchBookmarks()
  }, [isAuthenticated])

  const fetchBookmarks = async () => {
    try {
      const response = await fetch('/api/bookmarks', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setBookmarks(data.bookmarks || [])
      }
    } catch (error) {
      console.error('Error fetching bookmarks:', error)
    } finally {
      setLoading(false)
    }
  }

  const removeBookmark = async (bookmarkId) => {
    try {
      const response = await fetch(`/api/bookmarks/${bookmarkId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (response.ok) {
        setBookmarks(prev => prev.filter(b => b.id !== bookmarkId))
      }
    } catch (error) {
      console.error('Error removing bookmark:', error)
    }
  }

  const exportBookmarks = async (format) => {
    setExporting(true)
    try {
      const response = await fetch(`/api/export/bookmarks?format=${format}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `productsnap-bookmarks.${format === 'notion' ? 'csv' : format === 'json' ? 'json' : 'md'}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error exporting:', error)
    } finally {
      setExporting(false)
    }
  }

  const filteredBookmarks = bookmarks.filter(b => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      b.item?.title?.toLowerCase().includes(q) ||
      b.item?.guest?.toLowerCase().includes(q) ||
      b.notes?.toLowerCase().includes(q)
    )
  })

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Bookmark className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">My Bookmarks</h1>
                <Badge variant="secondary">{bookmarks.length}</Badge>
              </div>
            </div>

            {/* Export dropdown */}
            {bookmarks.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  onClick={() => exportBookmarks('markdown')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Search */}
        {bookmarks.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 max-w-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {bookmarks.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent flex items-center justify-center">
              <Bookmark className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No bookmarks yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Save articles and podcasts to read later
            </p>
            <Button onClick={() => navigate('/')}>Browse Content</Button>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No bookmarks match your search</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookmarks.map(bookmark => (
              <Card key={bookmark.id} className="p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    bookmark.type === 'podcast'
                      ? 'bg-primary/10'
                      : 'bg-accent'
                  }`}>
                    {bookmark.type === 'podcast' ? (
                      <Mic className="h-5 w-5 text-primary" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold line-clamp-1">
                          {bookmark.type === 'podcast'
                            ? bookmark.item?.guest
                            : bookmark.item?.title
                          }
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {bookmark.item?.description || 'No description'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {bookmark.item?.link && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open(bookmark.item.link, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeBookmark(bookmark.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Saved {formatDate(bookmark.createdAt)}
                      </span>
                      {bookmark.item?.category && (
                        <Badge variant="outline" className="text-xs">
                          {bookmark.item.category}
                        </Badge>
                      )}
                      {bookmark.type === 'podcast' && (
                        <span>Lenny's Podcast</span>
                      )}
                    </div>

                    {/* Notes */}
                    {bookmark.notes && (
                      <div className="mt-3 p-2 bg-accent/50 rounded-lg">
                        <p className="text-sm flex items-start gap-2">
                          <StickyNote className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          {bookmark.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Export options */}
        {bookmarks.length > 0 && (
          <div className="mt-8 pt-8 border-t border-border">
            <h3 className="text-sm font-medium mb-4">Export Options</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={exporting}
                onClick={() => exportBookmarks('json')}
              >
                Export as JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting}
                onClick={() => exportBookmarks('markdown')}
              >
                Export as Markdown
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting}
                onClick={() => exportBookmarks('notion')}
              >
                Export for Notion (CSV)
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default BookmarksPage
