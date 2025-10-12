import { useState, useEffect } from 'react'
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
  const [filteredArticles, setFilteredArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalArticles: 0, activeFeeds: 0, categories: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState('system')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [copiedLink, setCopiedLink] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(null)

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
        setFilteredArticles(articlesData.articles || [])
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

  // Handle filtering
  useEffect(() => {
    let filtered = [...articles]

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(article =>
        article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(article =>
        selectedCategories.includes(article.category)
      )
    }

    // Provider filter
    if (selectedProviders.length > 0) {
      filtered = filtered.filter(article =>
        selectedProviders.includes(article.feedName)
      )
    }

    // Time period filter
    if (selectedTimePeriod !== 'all') {
      const now = new Date()
      const articleDate = (article) => new Date(article.pubDate)

      switch (selectedTimePeriod) {
        case 'today':
          filtered = filtered.filter(article => {
            const date = articleDate(article)
            return date.toDateString() === now.toDateString()
          })
          break
        case 'week':
          filtered = filtered.filter(article => {
            const date = articleDate(article)
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            return date >= weekAgo
          })
          break
        case 'month':
          filtered = filtered.filter(article => {
            const date = articleDate(article)
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            return date >= monthAgo
          })
          break
        case '3months':
          filtered = filtered.filter(article => {
            const date = articleDate(article)
            const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
            return date >= threeMonthsAgo
          })
          break
        case '6months':
          filtered = filtered.filter(article => {
            const date = articleDate(article)
            const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
            return date >= sixMonthsAgo
          })
          break
        case 'year':
          filtered = filtered.filter(article => {
            const date = articleDate(article)
            const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
            return date >= yearAgo
          })
          break
      }
    }

    setFilteredArticles(filtered)
    setCurrentPage(1)
  }, [searchQuery, articles, selectedCategories, selectedProviders, selectedTimePeriod])

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

  // Filter handlers
  const toggleCategory = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const toggleProvider = (provider) => {
    setSelectedProviders(prev =>
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    )
  }

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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
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
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-gradient-to-r from-primary via-orange-500 to-secondary backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-white">Everything Product</h1>
            <div className="hidden md:flex items-center gap-4 text-sm text-white/90">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{stats.totalArticles}</span>
                <span>Articles</span>
              </div>
              <Separator orientation="vertical" className="h-6 bg-white/20" />
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{stats.activeFeeds}</span>
                <span>Feeds</span>
              </div>
              <Separator orientation="vertical" className="h-6 bg-white/20" />
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{stats.categories}</span>
                <span>Categories</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-48 bg-white/20 border-white/20 text-white">
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
      </header>

      <div className="container mx-auto flex gap-4 p-4">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-80 flex-shrink-0">
            <Card className="sticky top-20 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 shadow-xl border-2">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-secondary/5">
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
                      <div className="space-y-2.5 pr-2">
                        {categories.map((cat) => (
                          <div key={cat.category} className="flex items-center space-x-3 p-2 rounded hover:bg-background transition-colors">
                            <Checkbox
                              id={`cat-${cat.category}`}
                              checked={selectedCategories.includes(cat.category)}
                              onCheckedChange={() => toggleCategory(cat.category)}
                            />
                            <Label
                              htmlFor={`cat-${cat.category}`}
                              className="text-sm font-normal cursor-pointer flex-1 flex items-center justify-between"
                            >
                              <span>{cat.category}</span>
                              <Badge variant="outline" className="ml-2 text-xs">
                                {cat.count}
                              </Badge>
                            </Label>
                          </div>
                        ))}
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
                      <div className="space-y-2.5 pr-2">
                        {providers.map((provider) => (
                          <div key={provider.id} className="flex items-center space-x-3 p-2 rounded hover:bg-background transition-colors">
                            <Checkbox
                              id={`prov-${provider.id}`}
                              checked={selectedProviders.includes(provider.name)}
                              onCheckedChange={() => toggleProvider(provider.name)}
                            />
                            <Label
                              htmlFor={`prov-${provider.id}`}
                              className="text-sm font-normal cursor-pointer flex-1 flex items-center justify-between"
                            >
                              <span className="truncate">{provider.name}</span>
                              <Badge variant="outline" className="ml-2 text-xs flex-shrink-0">
                                {provider.articleCount || 0}
                              </Badge>
                            </Label>
                          </div>
                        ))}
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
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 backdrop-blur-sm bg-white/70 dark:bg-gray-800/70"
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
                <Card key={article.id} className="group hover:shadow-2xl transition-all duration-300 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 hover:scale-[1.03] overflow-hidden border-2 hover:border-primary/50">
                  <div className="h-1.5 w-full bg-gradient-to-r from-primary via-orange-500 to-secondary opacity-0 group-hover:opacity-100 transition-opacity" />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm text-muted-foreground font-medium">
                      {article.author || article.feedName}
                    </span>
                    <Badge className="shrink-0">{article.category}</Badge>
                  </div>
                  <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {article.title}
                  </h3>
                </CardHeader>

                <CardContent className="pb-3">
                  {article.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {article.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">{article.feedName}</p>
                </CardContent>

                <CardFooter className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(article.pubDate)}
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
                    <Popover open={previewOpen === article.id} onOpenChange={(open) => setPreviewOpen(open ? article.id : null)}>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          className="ml-2"
                          onMouseEnter={() => setPreviewOpen(article.id)}
                        >
                          Read
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[700px] p-0 shadow-2xl"
                        onMouseLeave={() => setPreviewOpen(null)}
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
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="text-sm text-muted-foreground">
                Showing {startIdx + 1}-{Math.min(startIdx + articlesPerPage, filteredArticles.length)} of {filteredArticles.length} articles
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="px-6"
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
                        className="min-w-[40px]"
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
                  className="px-6"
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
