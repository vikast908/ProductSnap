import { useState, useEffect, useMemo, useCallback } from 'react'
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
import { Filter, Search, X, ExternalLink, Linkedin, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

function App() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalArticles: 0, activeFeeds: 0, categories: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState('system')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [copiedLink, setCopiedLink] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(null)
  const [hoverTimeout, setHoverTimeout] = useState(null)

  // Filter state
  const [categories, setCategories] = useState([])
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
        const [articlesRes, statsRes, categoriesRes, providersRes] = await Promise.all([
          fetch('/api/articles?page=1&limit=1000'),
          fetch('/api/stats'),
          fetch('/api/categories'),
          fetch('/api/feeds')
        ])
        const articlesData = await articlesRes.json()
        const statsData = await statsRes.json()
        const categoriesData = await categoriesRes.json()
        const providersData = await providersRes.json()

        setArticles(articlesData.articles || [])
        setStats(statsData)
        setCategories(categoriesData || [])
        setProviders(providersData || [])
        setLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Optimized filtering with useMemo - prevents unnecessary recalculations
  const filteredArticles = useMemo(() => {
    // Quick return if no filters
    if (!searchQuery && selectedCategories.length === 0 && selectedProviders.length === 0 && selectedTimePeriod === 'all') {
      return articles
    }

    const searchLower = searchQuery.toLowerCase()
    const now = new Date()

    // Pre-calculate time threshold once
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
    return articles.filter(article => {
      // Category filter (fastest check first)
      if (categorySet && !categorySet.has(article.category)) {
        return false
      }

      // Provider filter
      if (providerSet && !providerSet.has(article.feedName)) {
        return false
      }

      // Search filter
      if (searchQuery && !(
        article.title?.toLowerCase().includes(searchLower) ||
        article.description?.toLowerCase().includes(searchLower) ||
        article.author?.toLowerCase().includes(searchLower) ||
        article.feedName?.toLowerCase().includes(searchLower)
      )) {
        return false
      }

      // Time period filter
      if (timeThreshold) {
        const articleDate = new Date(article.pubDate)
        if (selectedTimePeriod === 'today') {
          if (articleDate.toDateString() !== now.toDateString()) {
            return false
          }
        } else if (articleDate < timeThreshold) {
          return false
        }
      }

      return true
    })
  }, [searchQuery, articles, selectedCategories, selectedProviders, selectedTimePeriod])

  // Calculate dynamic stats based on filtered articles
  const dynamicStats = useMemo(() => {
    const uniqueCategories = new Set(filteredArticles.map(a => a.category))
    const uniqueSources = new Set(filteredArticles.map(a => a.feedName))
    return {
      totalArticles: filteredArticles.length,
      activeFeeds: uniqueSources.size,
      categories: uniqueCategories.size
    }
  }, [filteredArticles])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedCategories, selectedProviders, selectedTimePeriod])

  // Theme handling
  useEffect(() => {
    // Remove all theme classes
    document.documentElement.classList.remove('dark', 'newspaper', 'kindle', 'got', 'lotr', 'hp', 'amazon', 'sahara')

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
    // Delay closing to prevent flickering when moving between button and popover
    const closeTimeout = setTimeout(() => {
      setPreviewOpen(null)
    }, 150)

    return () => clearTimeout(closeTimeout)
  }, [hoverTimeout])

  const clearAllFilters = () => {
    setSelectedCategories([])
    setSelectedProviders([])
    setSelectedTimePeriod('all')
    setSearchQuery('')
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
            <h2 className="text-2xl font-bold text-foreground">Loading Everything Product</h2>
            <p className="text-muted-foreground">Fetching the latest articles...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-gradient-to-r from-primary via-orange-500 to-secondary backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-white">Everything Product</h1>
            <div className="hidden md:flex items-center gap-4 text-sm text-white/90">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{dynamicStats.totalArticles}</span>
                <span>Articles</span>
              </div>
              <Separator orientation="vertical" className="h-6 bg-white/20" />
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{dynamicStats.activeFeeds}</span>
                <span>Sources</span>
              </div>
              <Separator orientation="vertical" className="h-6 bg-white/20" />
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{dynamicStats.categories}</span>
                <span>Categories</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/80 hidden md:inline">Theme:</span>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-44 bg-white/20 border-white/20 text-white">
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
                </SelectContent>
              </Select>
            </div>
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
                {/* Categories Filter */}
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
                    <ScrollArea className="h-52 rounded-lg border bg-muted/30 p-3">
                      <div className="space-y-1.5 pr-2">
                        {categories.map((cat) => {
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
          {/* Search Bar */}
          <div className="mb-6 flex gap-3">
            {!sidebarOpen && (
              <Button variant="outline" size="icon" onClick={() => setSidebarOpen(true)}>
                <Filter className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, description, or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 backdrop-blur-sm bg-card"
              />
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
              {paginatedArticles.map((article) => (
                <Card key={article.id} className="group hover:shadow-2xl transition-all duration-300 backdrop-blur-sm bg-card hover:scale-[1.03] overflow-hidden border-2 hover:border-primary/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">
                        {article.author || article.feedName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(article.pubDate)}
                      </span>
                    </div>
                    <Badge className="shrink-0">{article.category}</Badge>
                  </div>
                  <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {article.title}
                  </h3>
                </CardHeader>

                <CardContent className="pb-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {article.description || 'No description available'}
                  </p>
                </CardContent>

                <CardFooter className="flex items-center justify-between pt-3 border-t">
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {article.feedName}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(article.link)}`, '_blank')}
                      title="Share on X (formerly Twitter)"
                    >
                      <span className="font-bold text-sm">𝕏</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(article.link)}`, '_blank')}
                    >
                      <Linkedin className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(article.link)}
                    >
                      {copiedLink === article.link ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Popover
                      open={previewOpen === article.id}
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
                          className="ml-2"
                          onMouseEnter={() => handlePreviewHover(article.id)}
                          onMouseLeave={() => {
                            if (hoverTimeout) {
                              clearTimeout(hoverTimeout)
                              setHoverTimeout(null)
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (previewOpen === article.id) {
                              setPreviewOpen(null)
                            }
                            window.open(article.link, '_blank')
                          }}
                          title="Hover to preview • Click to open in new tab"
                        >
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
                          articleUrl={article.link}
                          onClose={() => setPreviewOpen(null)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-4 py-8 bg-gradient-to-r from-primary/5 via-orange-500/5 to-secondary/5 rounded-lg p-6 border-2 border-primary/10">
              <div className="text-sm font-medium">
                Showing {startIdx + 1}-{Math.min(startIdx + articlesPerPage, filteredArticles.length)} of {filteredArticles.length} articles
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
    </div>
  )
}

export default App
