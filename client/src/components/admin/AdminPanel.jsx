import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserManager } from './UserManager'
import { ArrowLeft, Users, BarChart3, RefreshCw, Loader2, Shield, FileText, Rss, Activity } from 'lucide-react'

export function AdminPanel() {
  const { user, isAuthenticated, isAdmin, authFetch, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      navigate('/')
    }
  }, [isAuthenticated, isAdmin, authLoading, navigate])

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      fetchStats()
    }
  }, [isAuthenticated, isAdmin])

  const fetchStats = async () => {
    try {
      const response = await authFetch('/api/admin/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      } else {
        setError('Failed to fetch stats')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefreshFeeds = async () => {
    setRefreshing(true)
    setError(null)

    try {
      const response = await authFetch('/api/refresh', {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Feed refresh complete!\nNew articles: ${data.result.totalArticles}\nSuccess: ${data.result.successCount}\nErrors: ${data.result.errorCount}`)
        fetchStats() // Refresh stats
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to refresh feeds')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated || !isAdmin) {
    return null
  }

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Admin Panel</h1>
              </div>
              <p className="text-muted-foreground mt-1">
                Manage users, view stats, and control the system
              </p>
            </div>
            <Button onClick={handleRefreshFeeds} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Feeds
            </Button>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
              {error}
            </div>
          )}

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Users</CardDescription>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Users className="h-6 w-6 text-primary" />
                    {stats.users.total}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats.users.admins} admin{stats.users.admins !== 1 ? 's' : ''} · {stats.users.withApiKeys} with API keys
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Articles</CardDescription>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <FileText className="h-6 w-6 text-primary" />
                    {stats.content.articles.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    From {stats.content.activeFeeds} active feeds
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Feeds</CardDescription>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Rss className="h-6 w-6 text-primary" />
                    {stats.content.feeds}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats.content.activeFeeds} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>System</CardDescription>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <Activity className="h-6 w-6 text-primary" />
                    {formatUptime(stats.system.uptime)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Memory: {formatBytes(stats.system.memoryUsage.heapUsed)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="users" className="space-y-4">
            <TabsList>
              <TabsTrigger value="users">
                <Users className="h-4 w-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger value="system">
                <BarChart3 className="h-4 w-4 mr-2" />
                System
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <UserManager />
            </TabsContent>

            <TabsContent value="system">
              <Card>
                <CardHeader>
                  <CardTitle>System Information</CardTitle>
                  <CardDescription>Server and runtime details</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Node Version</p>
                          <p className="text-lg">{stats.system.nodeVersion}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Uptime</p>
                          <p className="text-lg">{formatUptime(stats.system.uptime)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Heap Used</p>
                          <p className="text-lg">{formatBytes(stats.system.memoryUsage.heapUsed)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Heap Total</p>
                          <p className="text-lg">{formatBytes(stats.system.memoryUsage.heapTotal)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">RSS</p>
                          <p className="text-lg">{formatBytes(stats.system.memoryUsage.rss)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">External</p>
                          <p className="text-lg">{formatBytes(stats.system.memoryUsage.external)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
