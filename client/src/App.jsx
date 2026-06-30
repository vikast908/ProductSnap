import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArticleReader } from '@/components/ArticleReader'
import { TranscriptViewer } from '@/components/TranscriptViewer'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/components/ui/toast'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { ChatPage } from '@/components/chat/ChatPage'
import { ChatBox } from '@/components/chat/ChatBox'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { BookmarksPage } from '@/components/bookmarks/BookmarksPage'
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage'
import { MyFilesPage } from '@/components/files/MyFilesPage'
import {
  Search, X, ExternalLink, Copy, Check,
  Mic, FileText, MessageSquare, Sun, Moon, Menu, ChevronRight,
  FolderOpen, Bookmark
} from 'lucide-react'

// Reading time estimator
const estimateReadTime = (content, description) => {
  const text = content || description || ''
  const words = text.split(/\s+/).filter(w => w.length > 0).length
  return Math.max(1, Math.ceil(words / 200))
}

// Format date
const formatDate = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffHours = (now - date) / (1000 * 60 * 60)

  if (diffHours < 24) return 'Today'
  if (diffHours < 48) return 'Yesterday'
  if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Main HomePage
function HomePage() {
  const { isAuthenticated, authFetch } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [stats, setStats] = useState({ totalArticles: 0, totalPodcasts: 0 })
  const [loading, setLoading] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system'
    }
    return 'system'
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [copiedLink, setCopiedLink] = useState(null)
  const [contentType, setContentType] = useState('all')
  const [selectedTranscript, setSelectedTranscript] = useState(null)
  const [readerArticle, setReaderArticle] = useState(null)
  const [readerOpen, setReaderOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])
  const [bookmarkMap, setBookmarkMap] = useState({}) // item id -> bookmark id (saved items)
  const [readSet, setReadSet] = useState(() => new Set()) // item ids the user has read

  const articlesPerPage = 24

  // Theme handling
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark')

    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) root.classList.add('dark')
    }

    localStorage.setItem('theme', theme)
  }, [theme])

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch stats and categories once on mount
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [statsRes, categoriesRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/categories')
        ])
        const statsData = await statsRes.json()
        const categoriesData = await categoriesRes.json()
        setStats({ totalArticles: statsData.totalArticles || 0, totalPodcasts: statsData.totalPodcasts || 0 })
        setCategories(categoriesData || [])
      } catch (error) {
        console.error('Error fetching stats/categories:', error)
      }
    }
    fetchInitial()
  }, [])

  // Fetch paginated data from server
  const fetchPage = useCallback(async (page, category, search, type) => {
    setLoading(true)
    try {
      let url
      if (type === 'podcasts') {
        const params = new URLSearchParams({ page: String(page), limit: String(articlesPerPage) })
        if (search) params.set('search', search)
        url = `/api/podcasts?${params}`
      } else {
        const params = new URLSearchParams({ page: String(page), limit: String(articlesPerPage) })
        if (type === 'all') params.set('includePodcasts', 'true')
        if (type === 'articles') params.set('type', 'article')
        if (category) params.set('category', category)
        if (search) params.set('search', search)
        url = `/api/articles?${params}`
      }

      const res = await fetch(url)
      const data = await res.json()

      const fetchedItems = data.articles || data.podcasts || []
      setItems(fetchedItems)
      setTotalItems(data.pagination?.total || 0)
      setTotalPages(data.pagination?.pages || 0)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-fetch when page, filters, or debounced search change
  useEffect(() => {
    fetchPage(currentPage, selectedCategory, debouncedSearch, contentType)
  }, [currentPage, selectedCategory, debouncedSearch, contentType, fetchPage])

  // Reset to page 1 when filters change (but not when page changes)
  const resetPage = useCallback((setter) => {
    return (value) => {
      setCurrentPage(1)
      setter(value)
    }
  }, [])

  const copyLink = async (link) => {
    await navigator.clipboard.writeText(link)
    setCopiedLink(link)
    setTimeout(() => setCopiedLink(null), 2000)
  }

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  // ⌘K / Ctrl+K toggles the AI chat for signed-in users
  useEffect(() => {
    if (!isAuthenticated) return
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setChatOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAuthenticated])

  // Load the user's saved + read state so cards can reflect it.
  useEffect(() => {
    if (!isAuthenticated) { setBookmarkMap({}); setReadSet(new Set()); return }
    let cancelled = false
    ;(async () => {
      try {
        const [bRes, hRes] = await Promise.all([
          authFetch('/api/bookmarks'),
          authFetch('/api/history?limit=200')
        ])
        if (!cancelled && bRes.ok) {
          const data = await bRes.json()
          const map = {}
          for (const b of data.bookmarks || []) {
            const key = b.articleId ?? b.podcastId
            if (key != null) map[key] = b.id
          }
          setBookmarkMap(map)
        }
        if (!cancelled && hRes.ok) {
          const data = await hRes.json()
          const set = new Set()
          for (const h of data.history || []) {
            if (h.articleId != null) set.add(h.articleId)
            if (h.podcastId != null) set.add(h.podcastId)
          }
          setReadSet(set)
        }
      } catch { /* non-fatal — cards just won't show saved/read state */ }
    })()
    return () => { cancelled = true }
  }, [isAuthenticated, authFetch])

  // Toggle a saved/bookmarked item (optimistic).
  const toggleBookmark = async (item, e) => {
    e.stopPropagation()
    const key = item.id
    const existingId = bookmarkMap[key]
    if (existingId) {
      setBookmarkMap(prev => { const n = { ...prev }; delete n[key]; return n })
      try { await authFetch(`/api/bookmarks/${existingId}`, { method: 'DELETE' }) }
      catch { setBookmarkMap(prev => ({ ...prev, [key]: existingId })) }
    } else {
      setBookmarkMap(prev => ({ ...prev, [key]: 'pending' }))
      try {
        const body = item.type === 'podcast' ? { podcastId: item.id } : { articleId: item.id }
        const res = await authFetch('/api/bookmarks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.bookmark) setBookmarkMap(prev => ({ ...prev, [key]: data.bookmark.id }))
        else setBookmarkMap(prev => { const n = { ...prev }; delete n[key]; return n })
      } catch { setBookmarkMap(prev => { const n = { ...prev }; delete n[key]; return n }) }
    }
  }

  // Full-page spinner only on very first load (no items yet and loading)
  if (loading && items.length === 0 && totalItems === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Derived page size (for the "showing X–Y of N" range label).
  const pageSize = totalPages > 0 ? Math.ceil(totalItems / totalPages) : (items.length || 1)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Nav */}
            <div className="flex items-center gap-3 sm:gap-6 lg:gap-8 min-w-0">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-accent transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <img src="/logo128.png" alt="ProductSnap" className="h-8 w-8 flex-shrink-0" />
                <h1 className="text-xl font-semibold tracking-tight truncate">ProductSnap</h1>
              </div>

              <nav className="hidden md:flex items-center gap-1">
                {[
                  { id: 'all', label: 'All', count: stats.totalArticles + stats.totalPodcasts },
                  { id: 'articles', label: 'Articles', count: stats.totalArticles },
                  { id: 'podcasts', label: 'Podcasts', count: stats.totalPodcasts }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => resetPage(setContentType)(tab.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${
                      contentType === tab.id
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 text-xs opacity-60">{tab.count}</span>
                  </button>
                ))}
                {isAuthenticated && (
                  <button
                    onClick={() => navigate('/my-files')}
                    className="px-4 py-2 text-sm font-medium rounded-full transition-all text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5"
                  >
                    <FolderOpen className="h-4 w-4" />
                    My Files
                  </button>
                )}
              </nav>
            </div>

            {/* Search & Actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-40 md:w-64 pl-9 h-9 bg-accent/50 border-0 focus-visible:ring-1"
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

              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-accent transition-colors"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => setChatOpen(!chatOpen)}
                    className={`p-2 rounded-full transition-colors ${
                      chatOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                    }`}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </button>
                  <UserMenu />
                </>
              ) : (
                <LoginButton />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex gap-6">
        {/* Sidebar */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 z-40 w-[85vw] max-w-[280px] sm:w-64 bg-background lg:bg-transparent
          transform transition-transform lg:transform-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          lg:block flex-shrink-0
        `}>
          <div className="lg:sticky lg:top-24 p-4 lg:p-0">
            <div className="flex items-center justify-between lg:hidden mb-4">
              <span className="font-semibold">Filters</span>
              <button onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile search */}
            <div className="sm:hidden mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 bg-accent/50 border-0"
                />
              </div>
            </div>

            {/* Mobile content type */}
            <div className="md:hidden mb-4 flex gap-1">
              {['all', 'articles', 'podcasts'].map(type => (
                <button
                  key={type}
                  onClick={() => resetPage(setContentType)(type)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                    contentType === type
                      ? 'bg-foreground text-background'
                      : 'bg-accent text-muted-foreground'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {/* Categories */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-2">
                Categories
              </p>

              <button
                onClick={() => resetPage(setSelectedCategory)(null)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                  !selectedCategory
                    ? 'bg-accent font-medium'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
              >
                <span>All Categories</span>
                <span className="text-xs">{stats.totalArticles + stats.totalPodcasts}</span>
              </button>

              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="space-y-0.5 pr-3">
                  {categories.map(cat => (
                    <button
                      key={cat.category}
                      onClick={() => resetPage(setSelectedCategory)(cat.category)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                        selectedCategory === cat.category
                          ? 'bg-accent font-medium'
                          : 'hover:bg-accent/50 text-muted-foreground'
                      }`}
                    >
                      <span className="truncate">{cat.category}</span>
                      <span className="text-xs flex-shrink-0 ml-2">{cat.count}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Results info */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {selectedCategory && (
                <Badge variant="secondary" className="gap-1.5 pr-1.5">
                  {selectedCategory}
                  <button
                    onClick={() => resetPage(setSelectedCategory)(null)}
                    className="ml-1 hover:bg-background/50 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <p className="text-sm text-muted-foreground">
                {totalPages > 1 && items.length > 0
                  ? `Showing ${(currentPage - 1) * pageSize + 1}–${(currentPage - 1) * pageSize + items.length} of ${totalItems.toLocaleString()}`
                  : `${totalItems.toLocaleString()} ${totalItems === 1 ? 'result' : 'results'}`}
              </p>
            </div>
          </div>

          {/* Content Grid */}
          {items.length === 0 && loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading results">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card overflow-hidden">
                  <div className="aspect-[16/9] bg-muted animate-pulse" />
                  <div className="p-4 space-y-2.5">
                    <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-full bg-muted rounded animate-pulse" />
                    <div className="h-3 w-5/6 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent flex items-center justify-center">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No results found</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Try adjusting your search or filters
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategory(null)
                  setCurrentPage(1)
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 transition-opacity ${loading ? 'opacity-60 pointer-events-none' : ''}`} aria-busy={loading}>
              {items.map(item => {
                const isPodcast = item.type === 'podcast'
                const title = isPodcast ? item.guest : item.title
                const isBookmarked = !!bookmarkMap[item.id]
                const isRead = readSet.has(item.id)
                const openItem = () => {
                  if (isAuthenticated) {
                    setReadSet(prev => { const n = new Set(prev); n.add(item.id); return n })
                    const body = isPodcast ? { podcastId: item.id } : { articleId: item.id }
                    authFetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
                  }
                  if (isPodcast) { setSelectedTranscript(item.id) }
                  else { setReaderArticle(item); setReaderOpen(true) }
                }
                const meta = isPodcast
                  ? (item.estimatedDuration || (item.wordCount ? `${item.wordCount.toLocaleString()} words` : ''))
                  : `${formatDate(item.pubDate)}${item.content ? ` · ${estimateReadTime(item.content, item.description)} min` : ''}`
                return (
                  <Card
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={openItem}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem() } }}
                    aria-label={`Open ${isPodcast ? 'podcast' : 'article'}: ${title}`}
                    className="group relative flex flex-col h-full overflow-hidden cursor-pointer border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* Thumbnail — image when available; centered glyph shows through the
                        gradient when there's no image (or it fails to load). */}
                    <div className="relative aspect-[16/9] bg-gradient-to-br from-accent to-muted overflow-hidden flex-shrink-0">
                      <div className="absolute inset-0 flex items-center justify-center">
                        {isPodcast ? <Mic className="h-10 w-10 text-muted-foreground/25" /> : <FileText className="h-10 w-10 text-muted-foreground/25" />}
                      </div>
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          loading="lazy"
                          className="relative w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                      )}
                      <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[11px] font-medium max-w-[70%]">
                        {isPodcast ? <Mic className="h-3 w-3 text-primary flex-shrink-0" /> : <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                        <span className="truncate">{isPodcast ? "Lenny's Podcast" : item.feedName}</span>
                      </div>
                      {isAuthenticated && (
                        <button
                          onClick={(e) => toggleBookmark(item, e)}
                          aria-label={isBookmarked ? 'Remove from saved' : 'Save for later'}
                          aria-pressed={isBookmarked}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-background/85 backdrop-blur text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current text-primary' : ''}`} />
                        </button>
                      )}
                      {isRead && (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Check className="h-3 w-3 text-green-600" /> Read
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col flex-1 p-4">
                      <h3 className="font-semibold leading-snug mb-1.5 line-clamp-2 group-hover:text-primary transition-colors">
                        {title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {item.description || 'No description available'}
                      </p>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                        <span className="text-xs text-muted-foreground truncate">{meta}</span>
                        {!isPodcast && (
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); copyLink(item.link) }}
                              aria-label="Copy link"
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                              {copiedLink === item.link ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Open original article in a new tab"
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Previous
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page
                  if (totalPages <= 5) {
                    page = i + 1
                  } else if (currentPage <= 3) {
                    page = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i
                  } else {
                    page = currentPage - 2 + i
                  }

                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 sm:w-9 sm:h-9 text-sm font-medium rounded-lg transition-colors ${
                        currentPage === page
                          ? 'bg-foreground text-background'
                          : 'hover:bg-accent'
                      }`}
                    >
                      {page}
                    </button>
                  )
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </main>
      </div>

      {/* Transcript Viewer */}
      {selectedTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
            <TranscriptViewer
              podcastId={selectedTranscript}
              onClose={() => setSelectedTranscript(null)}
            />
          </div>
        </div>
      )}

      {/* Article Reader */}
      {readerOpen && readerArticle && (() => {
        const articlesList = items.filter(a => a.type !== 'podcast')
        const currentIndex = articlesList.findIndex(a => a.id === readerArticle.id)

        return (
          <ArticleReader
            article={readerArticle}
            onClose={() => {
              setReaderOpen(false)
              setReaderArticle(null)
            }}
            onNext={() => {
              if (currentIndex < articlesList.length - 1) {
                setReaderArticle(articlesList[currentIndex + 1])
              }
            }}
            onPrev={() => {
              if (currentIndex > 0) {
                setReaderArticle(articlesList[currentIndex - 1])
              }
            }}
            hasNext={currentIndex < articlesList.length - 1}
            hasPrev={currentIndex > 0}
          />
        )
      })()}

      {/* Floating Chat */}
      {isAuthenticated && chatOpen && (
        <ChatBox isFloating={true} onClose={() => setChatOpen(false)} />
      )}
    </div>
  )
}

// App with routing
function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/bookmarks" element={<BookmarksPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/my-files" element={<MyFilesPage />} />
      </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
