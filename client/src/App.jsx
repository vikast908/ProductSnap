import { useState, useEffect, useMemo, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ArticlePreview } from '@/components/ArticlePreview'
import { ArticleReader } from '@/components/ArticleReader'
import { TranscriptViewer } from '@/components/TranscriptViewer'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { ChatPage } from '@/components/chat/ChatPage'
import { ChatBox } from '@/components/chat/ChatBox'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { Filter, Search, X, ExternalLink, Linkedin, Copy, Check, ChevronDown, ChevronUp, Mic, FileText, Clock, MessageSquare, BookOpen } from 'lucide-react'

// Helper function to get freshness badge based on publication date
const getAgeBadge = (pubDate) => {
  if (!pubDate) return null;
  const hoursDiff = (new Date() - new Date(pubDate)) / (1000 * 60 * 60);
  if (hoursDiff < 24) return { label: 'New', variant: 'default', className: 'bg-green-500 hover:bg-green-600 text-white' };
  if (hoursDiff < 48) return { label: 'Yesterday', variant: 'secondary', className: 'bg-blue-500 hover:bg-blue-600 text-white' };
  if (hoursDiff < 168) return { label: 'This Week', variant: 'outline', className: '' };
  return null;
};

// Helper function to estimate reading time based on content length
const estimateReadTime = (content, description) => {
  const text = content || description || '';
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min`;
};

// Main home page component
function HomePage() {
  const { isAuthenticated } = useAuth()
  const [articles, setArticles] = useState([])
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [stats, setStats] = useState({ totalArticles: 0, activeFeeds: 0, categories: 0, totalPodcasts: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState('system')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [copiedLink, setCopiedLink] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(null)
  const [hoverTimeout, setHoverTimeout] = useState(null)

  // In-app reader state
  const [readerArticle, setReaderArticle] = useState(null)
  const [readerOpen, setReaderOpen] = useState(false)

  // Content type: 'all', 'articles', 'podcasts'
  const [contentType, setContentType] = useState('all')
  const [selectedTranscript, setSelectedTranscript] = useState(null)

  // Filter state
  const [categories, setCategories] = useState([])
  const [categoryGroups, setCategoryGroups] = useState({ groups: [], ungrouped: [] })
  const [expandedGroups, setExpandedGroups] = useState({}) // Track which groups are expanded
  const [providers, setProviders] = useState([])
  const [selectedCategories, setSelectedCategories] = useState([])
  const [selectedProviders, setSelectedProviders] = useState([])
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('all')
  const [categoriesExpanded, setCategoriesExpanded] = useState(true)
  const [providersExpanded, setProvidersExpanded] = useState(false)
  const [timeExpanded, setTimeExpanded] = useState(false)

  const articlesPerPage = 20

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [articlesRes, podcastsRes, statsRes, categoriesRes, categoryGroupsRes, providersRes] = await Promise.all([
          fetch('/api/articles?page=1&limit=1000'),
          fetch('/api/podcasts?page=1&limit=500'),
          fetch('/api/stats'),
          fetch('/api/categories'),
          fetch('/api/category-groups'),
          fetch('/api/feeds')
        ])
        const articlesData = await articlesRes.json()
        const podcastsData = await podcastsRes.json()
        const statsData = await statsRes.json()
        const categoriesData = await categoriesRes.json()
        const categoryGroupsData = await categoryGroupsRes.json()
        const providersData = await providersRes.json()

        setArticles(articlesData.articles || [])
        setPodcasts(podcastsData.podcasts || [])
        setStats(statsData)
        // Add Lenny's Podcast to categories if podcasts exist
        const allCategories = categoriesData || []
        if (podcastsData.podcasts?.length > 0) {
          const podcastCategory = { category: "Lenny's Podcast", count: podcastsData.podcasts.length }
          if (!allCategories.find(c => c.category === "Lenny's Podcast")) {
            allCategories.unshift(podcastCategory)
          }
        }
        setCategories(allCategories)
        setCategoryGroups(categoryGroupsData || { groups: [], ungrouped: [] })
        setProviders(providersData || [])
        setLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Combine articles and podcasts based on content type
  const allContent = useMemo(() => {
    // Ensure podcasts have the type field (should already be set from API but be defensive)
    const podcastsWithType = podcasts.map(p => ({
      ...p,
      type: p.type || 'podcast'
    }))

    if (contentType === 'articles') {
      return articles.filter(a => a.type !== 'podcast')
    }
    if (contentType === 'podcasts') {
      return podcastsWithType
    }
    // For 'all', combine both - articles first, then podcasts
    return [...articles.filter(a => a.type !== 'podcast'), ...podcastsWithType]
  }, [articles, podcasts, contentType])

  // Optimized filtering with useMemo - prevents unnecessary recalculations
  const filteredArticles = useMemo(() => {
    // Quick return if no filters active
    const hasFilters = searchQuery || selectedCategories.length > 0 || selectedProviders.length > 0 || selectedTimePeriod !== 'all'

    if (!hasFilters) {
      return allContent
    }

    const searchLower = searchQuery.toLowerCase()
    const now = new Date()

    // Pre-calculate time threshold once (only for articles, not podcasts)
    let timeThreshold = null
    if (selectedTimePeriod !== 'all') {
      const days = {
        'today': 0,
        'week': 7,
        'month': 30,
        '3months': 90,
        '6months': 180,
        'year': 365
      }[selectedTimePeriod]

      if (selectedTimePeriod === 'today') {
        timeThreshold = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      } else {
        timeThreshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      }
    }

    // Convert arrays to Sets for O(1) lookup
    const categorySet = selectedCategories.length > 0 ? new Set(selectedCategories) : null
    const providerSet = selectedProviders.length > 0 ? new Set(selectedProviders) : null

    // Single-pass filtering for better performance
    return allContent.filter(item => {
      const isPodcast = item.type === 'podcast'

      // Category filter - for podcasts, check if "Lenny's Podcast" is selected or no category filter
      if (categorySet) {
        if (isPodcast) {
          // Include podcast if "Lenny's Podcast" category is selected
          if (!categorySet.has("Lenny's Podcast")) {
            return false
          }
        } else if (!categorySet.has(item.category)) {
          return false
        }
      }

      // Provider filter (podcasts use feedName = "Lenny's Podcast")
      if (providerSet && !providerSet.has(item.feedName)) {
        return false
      }

      // Search filter - include podcast guest search
      if (searchQuery && !(
        item.title?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.author?.toLowerCase().includes(searchLower) ||
        item.feedName?.toLowerCase().includes(searchLower) ||
        item.guest?.toLowerCase().includes(searchLower)
      )) {
        return false
      }

      // Time period filter - skip for podcasts which don't have dates
      if (timeThreshold && !isPodcast && item.pubDate) {
        const itemDate = new Date(item.pubDate)
        if (selectedTimePeriod === 'today') {
          if (itemDate.toDateString() !== now.toDateString()) {
            return false
          }
        } else if (itemDate < timeThreshold) {
          return false
        }
      }

      return true
    })
  }, [searchQuery, allContent, selectedCategories, selectedProviders, selectedTimePeriod])

  // Calculate dynamic stats based on filtered content
  const dynamicStats = useMemo(() => {
    const uniqueCategories = new Set(filteredArticles.map(a => a.category))
    const uniqueSources = new Set(filteredArticles.map(a => a.feedName))
    const articleCount = filteredArticles.filter(a => a.type !== 'podcast').length
    const podcastCount = filteredArticles.filter(a => a.type === 'podcast').length
    return {
      totalArticles: articleCount,
      totalPodcasts: podcastCount,
      totalContent: filteredArticles.length,
      activeFeeds: uniqueSources.size,
      categories: uniqueCategories.size
    }
  }, [filteredArticles])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedCategories, selectedProviders, selectedTimePeriod, contentType])

  // Theme handling
  useEffect(() => {
    // Remove all theme classes
    const themeClasses = ['dark', 'newspaper', 'kindle', 'got', 'lotr', 'hp', 'amazon', 'sahara', 'avatar']
    document.documentElement.classList.remove(...themeClasses)

    // Add the selected theme class
    if (theme !== 'system' && theme !== 'light') {
      document.documentElement.classList.add(theme)
    }
  }, [theme])

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const copyToClipboard = async (link) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedLink(link)
      setTimeout(() => setCopiedLink(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Optimized filter handlers with useCallback - prevents unnecessary re-renders
  const toggleCategory = useCallback((category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }, [])

  const toggleProvider = useCallback((provider) => {
    setSelectedProviders(prev =>
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    )
  }, [])

  // Toggle expansion of a category group
  const toggleGroupExpanded = useCallback((groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }))
  }, [])

  // Memoize selected categories as Set for O(1) lookups
  const selectedCategoriesSet = useMemo(
    () => new Set(selectedCategories),
    [selectedCategories]
  )

  // Toggle all categories in a group (select all or deselect all)
  const toggleGroupCategories = useCallback((group) => {
    const groupCategorySet = new Set(group.children.map(c => c.category))
    const allSelected = group.children.every(c => selectedCategoriesSet.has(c.category))

    if (allSelected) {
      // Deselect all categories in this group - O(n) filter with O(1) lookup
      setSelectedCategories(prev => prev.filter(c => !groupCategorySet.has(c)))
    } else {
      // Select all categories in this group - use Set for deduplication
      setSelectedCategories(prev => {
        const combined = new Set(prev)
        group.children.forEach(c => combined.add(c.category))
        return Array.from(combined)
      })
    }
  }, [selectedCategoriesSet])

  // Check if all categories in a group are selected
  const isGroupFullySelected = useCallback((group) => {
    return group.children.every(c => selectedCategoriesSet.has(c.category))
  }, [selectedCategoriesSet])

  // Check if some categories in a group are selected
  const isGroupPartiallySelected = useCallback((group) => {
    const selectedCount = group.children.filter(c => selectedCategoriesSet.has(c.category)).length
    return selectedCount > 0 && selectedCount < group.children.length
  }, [selectedCategoriesSet])

  // Debounced preview handler - waits 500ms before showing preview
  const handlePreviewHover = useCallback((articleId) => {
    // Clear any existing timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
    }

    // Set new timeout - increased to 500ms to prevent accidental opens
    const timeout = setTimeout(() => {
      setPreviewOpen(articleId)
    }, 500)

    setHoverTimeout(timeout)
  }, [hoverTimeout])

  const handlePreviewLeave = useCallback(() => {
    // Clear timeout if user moves away before preview opens
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      setHoverTimeout(null)
    }
    // Note: Close delay handled by Popover's onOpenChange for smoother UX
  }, [hoverTimeout])

  const clearAllFilters = () => {
    setSelectedCategories([])
    setSelectedProviders([])
    setSelectedTimePeriod('all')
    setSearchQuery('')
    setContentType('all')
  }

  // Pagination
  const totalPages = Math.ceil(filteredArticles.length / articlesPerPage)
  const startIdx = (currentPage - 1) * articlesPerPage
  const paginatedArticles = filteredArticles.slice(startIdx, startIdx + articlesPerPage)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-6">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-4 border-secondary/20"></div>
            <div className="absolute inset-2 rounded-full border-4 border-secondary border-t-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1s' }}></div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Loading ProductSnap</h2>
            <p className="text-muted-foreground">Fetching the latest articles...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Uses theme colors */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-gradient-to-r from-primary via-secondary to-accent shadow-lg">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-primary-foreground drop-shadow-sm">ProductSnap</h1>
            <div className="hidden md:flex items-center gap-4 text-sm text-primary-foreground/90">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="font-bold text-lg">{dynamicStats.totalArticles}</span>
                <span>Articles</span>
              </div>
              <Separator orientation="vertical" className="h-6 bg-primary-foreground/20" />
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4" />
                <span className="font-bold text-lg">{dynamicStats.totalPodcasts}</span>
                <span>Podcasts</span>
              </div>
              <Separator orientation="vertical" className="h-6 bg-primary-foreground/20" />
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{dynamicStats.activeFeeds}</span>
                <span>Sources</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-primary-foreground/80 hidden md:inline">Theme:</span>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-44 bg-primary-foreground/20 border-primary-foreground/20 text-primary-foreground">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="newspaper">Newspaper</SelectItem>
                  <SelectItem value="kindle">Kindle</SelectItem>
                  <SelectItem value="got">Game of Thrones</SelectItem>
                  <SelectItem value="lotr">Lord of the Rings</SelectItem>
                  <SelectItem value="hp">Harry Potter</SelectItem>
                  <SelectItem value="amazon">Amazon Forest</SelectItem>
                  <SelectItem value="sahara">Sahara Desert</SelectItem>
                  <SelectItem value="avatar">Avatar (Pandora)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setChatOpen(!chatOpen)}
                  className="h-10 w-10 text-primary-foreground hover:bg-primary-foreground/20"
                  title="AI Chat"
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
                <UserMenu />
              </div>
            ) : (
              <LoginButton
                variant="secondary"
                className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground"
              />
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto flex gap-4 p-4">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-80 flex-shrink-0">
            <Card className="sticky top-20 backdrop-blur-md bg-card shadow-xl border-2">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-secondary/5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Filter className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-lg">Filters</h3>
                      {(selectedCategories.length > 0 || selectedProviders.length > 0 || selectedTimePeriod !== 'all') && (
                        <Badge variant="secondary" className="ml-2">
                          {selectedCategories.length + selectedProviders.length + (selectedTimePeriod !== 'all' ? 1 : 0)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {(selectedCategories.length > 0 || selectedProviders.length > 0 || selectedTimePeriod !== 'all') && (
                        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 px-3 text-xs hover:bg-destructive/10 hover:text-destructive">
                          Clear All
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="hover:bg-muted">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select multiple options to show articles matching any of them (OR logic)
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {/* Categories Filter with Groups */}
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-3 h-auto hover:bg-primary/5 rounded-lg"
                    onClick={() => setCategoriesExpanded(!categoriesExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Categories</span>
                      {selectedCategories.length > 0 && (
                        <Badge variant="default" className="ml-1 h-5 min-w-[20px] flex items-center justify-center">
                          {selectedCategories.length}
                        </Badge>
                      )}
                    </div>
                    {categoriesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  {categoriesExpanded && (
                    <ScrollArea className="h-72 rounded-lg border bg-muted/30 p-3">
                      <div className="space-y-2 pr-2">
                        {/* Category Groups */}
                        {categoryGroups.groups?.map((group) => {
                          const isExpanded = expandedGroups[group.name]
                          const isFullySelected = isGroupFullySelected(group)
                          const isPartiallySelected = isGroupPartiallySelected(group)

                          return (
                            <div key={group.name} className="space-y-1">
                              {/* Group Header */}
                              <div
                                className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                                  isFullySelected
                                    ? 'bg-primary/15 border border-primary/40'
                                    : isPartiallySelected
                                    ? 'bg-primary/5 border border-primary/20'
                                    : 'hover:bg-background border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1" onClick={() => toggleGroupExpanded(group.name)}>
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  <span className={`text-sm ${isFullySelected || isPartiallySelected ? 'font-semibold' : 'font-medium'}`}>
                                    {group.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Badge variant={isFullySelected ? "default" : "outline"} className="text-xs">
                                    {group.totalCount}
                                  </Badge>
                                  <Checkbox
                                    checked={isFullySelected}
                                    className={isPartiallySelected ? 'data-[state=checked]:bg-primary/50' : ''}
                                    onCheckedChange={() => toggleGroupCategories(group)}
                                  />
                                </div>
                              </div>

                              {/* Group Children */}
                              {isExpanded && (
                                <div className="ml-4 space-y-1 border-l-2 border-muted pl-2">
                                  {group.children.map((cat) => {
                                    const isSelected = selectedCategories.includes(cat.category)
                                    return (
                                      <div
                                        key={cat.category}
                                        className={`flex items-center space-x-2 p-1.5 rounded cursor-pointer text-sm ${
                                          isSelected
                                            ? 'bg-primary/10 border border-primary/30'
                                            : 'hover:bg-background border border-transparent'
                                        }`}
                                        onClick={() => toggleCategory(cat.category)}
                                      >
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() => toggleCategory(cat.category)}
                                          className="pointer-events-none h-3.5 w-3.5"
                                        />
                                        <span className={`flex-1 ${isSelected ? 'font-medium' : ''}`}>{cat.category}</span>
                                        <Badge variant={isSelected ? "default" : "outline"} className="text-xs h-5">
                                          {cat.count}
                                        </Badge>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* Ungrouped Categories */}
                        {categoryGroups.ungrouped?.length > 0 && (
                          <>
                            <div className="border-t border-muted my-2" />
                            {categoryGroups.ungrouped.map((cat) => {
                              const isSelected = selectedCategories.includes(cat.category)
                              return (
                                <div
                                  key={cat.category}
                                  className={`flex items-center space-x-3 p-2 rounded cursor-pointer ${
                                    isSelected
                                      ? 'bg-primary/10 border border-primary/30'
                                      : 'hover:bg-background border border-transparent'
                                  }`}
                                  onClick={() => toggleCategory(cat.category)}
                                >
                                  <Checkbox
                                    id={`cat-${cat.category}`}
                                    checked={isSelected}
                                    onCheckedChange={() => toggleCategory(cat.category)}
                                    className="pointer-events-none"
                                  />
                                  <Label
                                    htmlFor={`cat-${cat.category}`}
                                    className="text-sm cursor-pointer flex-1 flex items-center justify-between pointer-events-none"
                                  >
                                    <span className={isSelected ? 'font-medium' : 'font-normal'}>{cat.category}</span>
                                    <Badge variant={isSelected ? "default" : "outline"} className="ml-2 text-xs">
                                      {cat.count}
                                    </Badge>
                                  </Label>
                                </div>
                              )
                            })}
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                <Separator />

                {/* Providers Filter */}
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-3 h-auto hover:bg-primary/5 rounded-lg"
                    onClick={() => setProvidersExpanded(!providersExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Providers</span>
                      {selectedProviders.length > 0 && (
                        <Badge variant="default" className="ml-1 h-5 min-w-[20px] flex items-center justify-center">
                          {selectedProviders.length}
                        </Badge>
                      )}
                    </div>
                    {providersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  {providersExpanded && (
                    <ScrollArea className="h-52 rounded-lg border bg-muted/30 p-3">
                      <div className="space-y-1.5 pr-2">
                        {providers.map((provider) => {
                          const isSelected = selectedProviders.includes(provider.name)
                          return (
                            <div
                              key={provider.id}
                              className={`flex items-center space-x-3 p-2 rounded cursor-pointer ${
                                isSelected
                                  ? 'bg-primary/10 border border-primary/30'
                                  : 'hover:bg-background border border-transparent'
                              }`}
                              onClick={() => toggleProvider(provider.name)}
                            >
                              <Checkbox
                                id={`prov-${provider.id}`}
                                checked={isSelected}
                                onCheckedChange={() => toggleProvider(provider.name)}
                                className="pointer-events-none"
                              />
                              <Label
                                htmlFor={`prov-${provider.id}`}
                                className="text-sm cursor-pointer flex-1 flex items-center justify-between pointer-events-none"
                              >
                                <span className={`truncate ${isSelected ? 'font-medium' : 'font-normal'}`}>{provider.name}</span>
                                <Badge variant={isSelected ? "default" : "outline"} className="ml-2 text-xs flex-shrink-0">
                                  {provider.articleCount || 0}
                                </Badge>
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                <Separator />

                {/* Time Period Filter */}
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-3 h-auto hover:bg-primary/5 rounded-lg"
                    onClick={() => setTimeExpanded(!timeExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Time Period</span>
                      {selectedTimePeriod !== 'all' && (
                        <Badge variant="default" className="ml-1 h-5 px-2 flex items-center justify-center text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                    {timeExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  {timeExpanded && (
                    <div className="space-y-2 px-1">
                      <Select value={selectedTimePeriod} onValueChange={setSelectedTimePeriod}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select time period" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Time</SelectItem>
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="week">Last Week</SelectItem>
                          <SelectItem value="month">Last Month</SelectItem>
                          <SelectItem value="3months">Last 3 Months</SelectItem>
                          <SelectItem value="6months">Last 6 Months</SelectItem>
                          <SelectItem value="year">Last Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </aside>
        )}

        {/* Main Content */}
        <div className="flex-1">
          {/* Search Bar and Content Type Toggle */}
          <div className="mb-6 space-y-4">
            <div className="flex gap-3">
              {!sidebarOpen && (
                <Button variant="outline" size="icon" onClick={() => setSidebarOpen(true)}>
                  <Filter className="h-4 w-4" />
                </Button>
              )}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={contentType === 'podcasts' ? "Search podcast guests, topics..." : "Search by title, description, or author..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 backdrop-blur-sm bg-card"
                />
              </div>
            </div>

            {/* Content Type Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground mr-2">Show:</span>
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={contentType === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setContentType('all')}
                  className="h-8"
                >
                  All
                  <Badge variant="secondary" className="ml-2 h-5">{articles.length + podcasts.length}</Badge>
                </Button>
                <Button
                  variant={contentType === 'articles' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setContentType('articles')}
                  className="h-8"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Articles
                  <Badge variant="secondary" className="ml-2 h-5">{articles.length}</Badge>
                </Button>
                <Button
                  variant={contentType === 'podcasts' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setContentType('podcasts')}
                  className="h-8"
                >
                  <Mic className="h-4 w-4 mr-1" />
                  Lenny's Podcast
                  <Badge variant="secondary" className="ml-2 h-5">{podcasts.length}</Badge>
                </Button>
              </div>
            </div>
          </div>

          {/* Articles Grid */}
          {filteredArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="text-center space-y-4 max-w-md">
                <div className="w-24 h-24 mx-auto bg-muted rounded-full flex items-center justify-center">
                  <Search className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-bold">No Articles Found</h3>
                <p className="text-muted-foreground">
                  {searchQuery || selectedCategories.length > 0 || selectedProviders.length > 0 || selectedTimePeriod !== 'all'
                    ? "Try adjusting your filters or search query to find more articles."
                    : "There are no articles available at the moment."}
                </p>
                {(searchQuery || selectedCategories.length > 0 || selectedProviders.length > 0 || selectedTimePeriod !== 'all') && (
                  <Button onClick={clearAllFilters} variant="outline">
                    Clear All Filters
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {paginatedArticles.map((item) => (
                item.type === 'podcast' ? (
                  // Podcast Card
                  <Card key={item.id} className="group hover:shadow-2xl transition-all duration-300 backdrop-blur-sm bg-card hover:scale-[1.03] overflow-hidden border-2 hover:border-secondary/50 bg-gradient-to-br from-secondary/5 to-primary/5">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <Mic className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs font-medium text-muted-foreground">Lenny's Podcast</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {item.estimatedDuration}
                            </span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0 bg-secondary/20">
                          <Mic className="h-3 w-3 mr-1" />
                          Podcast
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-secondary transition-colors">
                        {item.guest}
                      </h3>
                    </CardHeader>

                    <CardContent className="pb-3">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span>{item.wordCount?.toLocaleString()} words</span>
                      </div>
                    </CardContent>

                    <CardFooter className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-muted-foreground">
                        Full transcript available
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedTranscript(item.id)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Read Transcript
                      </Button>
                    </CardFooter>
                  </Card>
                ) : (
                  // Article Card
                  <Card key={item.id} className="group hover:shadow-2xl transition-all duration-300 backdrop-blur-sm bg-card hover:scale-[1.03] overflow-hidden border-2 hover:border-primary/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <span className="text-sm font-medium truncate">
                            {item.author || item.feedName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(item.pubDate)}
                          </span>
                        </div>
                        {/* Multiple badges: category, freshness, reading time */}
                        <div className="flex flex-wrap gap-1 shrink-0 justify-end max-w-[60%]">
                          <Badge className="text-xs">{item.category}</Badge>
                          {(() => {
                            const ageBadge = getAgeBadge(item.pubDate)
                            return ageBadge ? (
                              <Badge className={`text-xs ${ageBadge.className}`}>
                                {ageBadge.label}
                              </Badge>
                            ) : null
                          })()}
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {estimateReadTime(item.content, item.description)}
                          </Badge>
                        </div>
                      </div>
                      <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                    </CardHeader>

                    <CardContent className="pb-3">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {item.description || 'No description available'}
                      </p>
                    </CardContent>

                    <CardFooter className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {item.feedName}
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(item.title)}&url=${encodeURIComponent(item.link)}`, '_blank')}
                          title="Share on X (formerly Twitter)"
                        >
                          <span className="font-bold text-sm">𝕏</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(item.link)}`, '_blank')}
                        >
                          <Linkedin className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyToClipboard(item.link)}
                        >
                          {copiedLink === item.link ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        {/* External Link Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(item.link, '_blank')}
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {/* Read Button with Popover Preview */}
                        <Popover
                          open={previewOpen === item.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              if (hoverTimeout) {
                                clearTimeout(hoverTimeout)
                                setHoverTimeout(null)
                              }
                              setPreviewOpen(null)
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              size="sm"
                              className="ml-1"
                              onMouseEnter={() => handlePreviewHover(item.id)}
                              onMouseLeave={() => {
                                if (hoverTimeout) {
                                  clearTimeout(hoverTimeout)
                                  setHoverTimeout(null)
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (previewOpen === item.id) {
                                  setPreviewOpen(null)
                                }
                                // Open in-app reader instead of new tab
                                setReaderArticle(item)
                                setReaderOpen(true)
                              }}
                              title="Hover to preview • Click to read"
                            >
                              <BookOpen className="h-4 w-4 mr-1" />
                              Read
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[700px] p-0 shadow-2xl"
                            onMouseEnter={() => {
                              // Keep preview open when hovering over it
                              if (hoverTimeout) {
                                clearTimeout(hoverTimeout)
                                setHoverTimeout(null)
                              }
                            }}
                            onMouseLeave={() => {
                              // Close preview when leaving the popover
                              setPreviewOpen(null)
                            }}
                            side="top"
                            align="end"
                          >
                            <ArticlePreview
                              articleUrl={item.link}
                              onClose={() => setPreviewOpen(null)}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </CardFooter>
                  </Card>
                )
              ))}
          </div>
          )}

          {/* Transcript Viewer Modal */}
          {selectedTranscript && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-card rounded-lg shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
                <TranscriptViewer
                  podcastId={selectedTranscript}
                  onClose={() => setSelectedTranscript(null)}
                />
              </div>
            </div>
          )}

          {/* Article Reader Modal */}
          {readerOpen && readerArticle && (() => {
            // Compute articlesList once for all navigation props
            const articlesList = paginatedArticles.filter(a => a.type !== 'podcast')
            const currentIndex = articlesList.findIndex(a => a.id === readerArticle.id)
            const hasNext = currentIndex >= 0 && currentIndex < articlesList.length - 1
            const hasPrev = currentIndex > 0

            return (
              <ArticleReader
                article={readerArticle}
                onClose={() => {
                  setReaderOpen(false)
                  setReaderArticle(null)
                }}
                onNext={() => {
                  if (hasNext) {
                    setReaderArticle(articlesList[currentIndex + 1])
                  }
                }}
                onPrev={() => {
                  if (hasPrev) {
                    setReaderArticle(articlesList[currentIndex - 1])
                  }
                }}
                hasNext={hasNext}
                hasPrev={hasPrev}
              />
            )
          })()}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-4 py-8 bg-gradient-to-r from-primary/5 via-orange-500/5 to-secondary/5 rounded-lg p-6 border-2 border-primary/10">
              <div className="text-sm font-medium">
                Showing {startIdx + 1}-{Math.min(startIdx + articlesPerPage, filteredArticles.length)} of {filteredArticles.length} {contentType === 'podcasts' ? 'podcasts' : contentType === 'articles' ? 'articles' : 'items'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="px-6 font-medium"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 7) {
                      pageNum = i + 1
                    } else if (currentPage <= 4) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i
                    } else {
                      pageNum = currentPage - 3 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        onClick={() => setCurrentPage(pageNum)}
                        className="min-w-[40px] font-medium"
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="px-6 font-medium"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Chat Box */}
      {isAuthenticated && chatOpen && (
        <ChatBox isFloating={true} onClose={() => setChatOpen(false)} />
      )}
    </div>
  )
}

// Main App component with routing
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
