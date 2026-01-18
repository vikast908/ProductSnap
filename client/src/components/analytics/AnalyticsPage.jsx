import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3, ArrowLeft, BookOpen, Search, MessageSquare,
  Bookmark, History, TrendingUp, Activity, Clock
} from 'lucide-react'

export function AnalyticsPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/')
      return
    }
    fetchAnalytics()
  }, [isAuthenticated, days])

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`/api/analytics?days=${days}`, {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data)
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const personal = analytics?.personal || {}
  const isAdmin = user?.role === 'admin'

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
                <BarChart3 className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">My Analytics</h1>
              </div>
            </div>

            {/* Time period selector */}
            <div className="flex items-center gap-2">
              {[7, 30, 90].map(d => (
                <Button
                  key={d}
                  variant={days === d ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{personal.articlesRead || 0}</p>
                <p className="text-xs text-muted-foreground">Articles Read</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{personal.podcastsRead || 0}</p>
                <p className="text-xs text-muted-foreground">Podcasts Viewed</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Search className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{personal.totalSearches || 0}</p>
                <p className="text-xs text-muted-foreground">Searches</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{personal.totalChats || 0}</p>
                <p className="text-xs text-muted-foreground">AI Chats</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Bookmark className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-semibold">{personal.bookmarksCount || 0}</p>
                <p className="text-xs text-muted-foreground">Saved Bookmarks</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-semibold">{personal.readHistoryCount || 0}</p>
                <p className="text-xs text-muted-foreground">Items in History</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Top Categories */}
        {personal.topCategories?.length > 0 && (
          <Card className="p-6 mb-8">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Top Categories
            </h3>
            <div className="space-y-3">
              {personal.topCategories.map((cat, idx) => (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-6">{idx + 1}.</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{cat.category}</span>
                      <span className="text-xs text-muted-foreground">{cat.count} views</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: `${(cat.count / personal.topCategories[0].count) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Recent Searches */}
        {personal.recentSearches?.length > 0 && (
          <Card className="p-6 mb-8">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Search className="h-4 w-4" />
              Recent Searches
            </h3>
            <div className="flex flex-wrap gap-2">
              {personal.recentSearches.map((query, idx) => (
                <Badge key={idx} variant="secondary">
                  {query}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Admin Section */}
        {isAdmin && analytics?.admin && (
          <>
            <div className="border-t border-border pt-8 mt-8">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Admin Analytics
              </h2>

              {/* System Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <Card className="p-4">
                  <p className="text-2xl font-bold">{analytics.admin.totalUsers}</p>
                  <p className="text-xs text-muted-foreground">Total Users</p>
                </Card>
                <Card className="p-4">
                  <p className="text-2xl font-bold">{analytics.admin.totalArticles}</p>
                  <p className="text-xs text-muted-foreground">Total Articles</p>
                </Card>
                <Card className="p-4">
                  <p className="text-2xl font-bold">{analytics.admin.totalPodcasts}</p>
                  <p className="text-xs text-muted-foreground">Podcast Transcripts</p>
                </Card>
                <Card className="p-4">
                  <p className="text-2xl font-bold">{analytics.admin.feedHealth?.avgHealthScore}%</p>
                  <p className="text-xs text-muted-foreground">Avg Feed Health</p>
                </Card>
              </div>

              {/* Feed Health */}
              {analytics.admin.feedHealth && (
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Feed Health Overview</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-green-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {analytics.admin.feedHealth.healthy}
                      </p>
                      <p className="text-xs text-muted-foreground">Healthy</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-600">
                        {analytics.admin.feedHealth.warning}
                      </p>
                      <p className="text-xs text-muted-foreground">Warning</p>
                    </div>
                    <div className="text-center p-4 bg-red-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">
                        {analytics.admin.feedHealth.unhealthy}
                      </p>
                      <p className="text-xs text-muted-foreground">Unhealthy</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Period info */}
        <p className="text-xs text-muted-foreground text-center mt-8">
          Showing data for the last {days} days
        </p>
      </main>
    </div>
  )
}

export default AnalyticsPage
