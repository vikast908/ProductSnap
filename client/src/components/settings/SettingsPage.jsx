import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/toast'
import { AsyncButton } from '@/components/ui/async-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Key, Palette, Save, Check, AlertCircle, Eye, EyeOff, Loader2, ExternalLink } from 'lucide-react'

export function SettingsPage() {
  const { user, isAuthenticated, updateSettings, saveApiKeys, authFetch, loading } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [providers, setProviders] = useState([])
  const [preferences, setPreferences] = useState({ defaultAIProvider: 'openai', theme: 'system', customBaseUrl: '' })
  const [apiKeys, setApiKeys] = useState({})
  const [showKeys, setShowKeys] = useState({})
  const [verify, setVerify] = useState({}) // { [providerId]: { status, msg } }
  const [saving, setSaving] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate('/')
  }, [isAuthenticated, loading, navigate])

  // Load the provider registry (models, key hints, docs links) from the server.
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    authFetch('/api/chat/providers')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setProviders(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAuthenticated, authFetch])

  // Seed preferences from the user, then default any unset model to the provider default.
  useEffect(() => {
    setPreferences(prev => ({ ...prev, ...(user?.settings?.preferences || {}) }))
  }, [user])

  useEffect(() => {
    if (!providers.length) return
    setPreferences(prev => {
      const next = { ...prev }
      for (const p of providers) {
        const key = `${p.id}Model`
        if (!next[key] && p.defaultModel) next[key] = p.defaultModel
      }
      return next
    })
  }, [providers])

  const handleSavePreferences = async () => {
    setSaving(true)
    const result = await updateSettings(preferences)
    setSaving(false)
    if (result.success) toast({ variant: 'success', title: 'Preferences saved' })
    else toast({ variant: 'error', title: 'Could not save preferences', description: result.error })
  }

  const handleSaveApiKeys = async () => {
    const keysToSave = {}
    for (const [provider, key] of Object.entries(apiKeys)) {
      if (key && key.trim()) keysToSave[provider] = key.trim()
    }
    if (Object.keys(keysToSave).length === 0) {
      toast({ variant: 'error', title: 'Enter at least one API key to save' })
      return
    }
    setSavingKeys(true)
    const result = await saveApiKeys(keysToSave)
    setSavingKeys(false)
    if (result.success) {
      setApiKeys({})
      toast({ variant: 'success', title: 'API keys saved', description: 'Encrypted and stored securely.' })
    } else {
      toast({ variant: 'error', title: 'Could not save keys', description: result.error })
    }
  }

  const verifyKey = async (providerId) => {
    const key = (apiKeys[providerId] || '').trim()
    if (!key) {
      toast({ variant: 'error', title: 'Enter the key first', description: 'Type a key in the field, then verify.' })
      return
    }
    setVerify(prev => ({ ...prev, [providerId]: { status: 'checking' } }))
    try {
      const body = { apiKey: key }
      if (providerId === 'custom') body.baseUrl = preferences.customBaseUrl
      const res = await authFetch(`/api/settings/api-keys/verify/${providerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok && data.valid) {
        setVerify(prev => ({ ...prev, [providerId]: { status: 'valid' } }))
      } else {
        setVerify(prev => ({ ...prev, [providerId]: { status: 'invalid', msg: data.error || 'Rejected' } }))
      }
    } catch (e) {
      setVerify(prev => ({ ...prev, [providerId]: { status: 'invalid', msg: 'Verification failed' } }))
    }
  }

  const toggleShowKey = (id) => setShowKeys(prev => ({ ...prev, [id]: !prev[id] }))

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
        </Button>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your preferences, AI providers, and API keys</p>
          </div>

          <Tabs defaultValue="preferences" className="space-y-4">
            <TabsList>
              <TabsTrigger value="preferences"><Palette className="h-4 w-4 mr-2" /> Preferences</TabsTrigger>
              <TabsTrigger value="apikeys"><Key className="h-4 w-4 mr-2" /> AI Providers</TabsTrigger>
            </TabsList>

            {/* ---------------- Preferences ---------------- */}
            <TabsContent value="preferences">
              <Card>
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                  <CardDescription>Default AI provider, per-provider models, and theme.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="defaultAIProvider">Default AI Provider</Label>
                    <Select value={preferences.defaultAIProvider} onValueChange={(v) => setPreferences(p => ({ ...p, defaultAIProvider: v }))}>
                      <SelectTrigger id="defaultAIProvider"><SelectValue placeholder="Select provider" /></SelectTrigger>
                      <SelectContent>
                        {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Used as the default for AI chat.</p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-1">Model Selection</h4>
                      <p className="text-xs text-muted-foreground">Choose the model used for each provider.</p>
                    </div>

                    {providers.map(p => {
                      const modelKey = `${p.id}Model`
                      const hasList = p.models && p.models.length > 0
                      return (
                        <div key={p.id} className="space-y-2">
                          <Label htmlFor={modelKey}>{p.name} model</Label>
                          {hasList ? (
                            <Select value={preferences[modelKey] || p.defaultModel} onValueChange={(v) => setPreferences(prev => ({ ...prev, [modelKey]: v }))}>
                              <SelectTrigger id={modelKey}><SelectValue placeholder="Select model" /></SelectTrigger>
                              <SelectContent>
                                {p.models.map(m => (
                                  <SelectItem key={m.id} value={m.id}>
                                    <div className="flex flex-col">
                                      <span>{m.name} <span className="text-xs text-muted-foreground">· {m.context}</span></span>
                                      <span className="text-xs text-muted-foreground">{m.description}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={modelKey}
                              placeholder="Model name, e.g. gpt-4o or llama-3.1-8b"
                              value={preferences[modelKey] || ''}
                              onChange={(e) => setPreferences(prev => ({ ...prev, [modelKey]: e.target.value }))}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="theme">Theme</Label>
                    <Select value={preferences.theme} onValueChange={(v) => setPreferences(p => ({ ...p, theme: v }))}>
                      <SelectTrigger id="theme"><SelectValue placeholder="Select theme" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <AsyncButton onClick={handleSavePreferences} successLabel="Saved" disabled={saving}>
                    <Save className="h-4 w-4 mr-2" /> Save Preferences
                  </AsyncButton>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- API Providers ---------------- */}
            <TabsContent value="apikeys">
              <Card>
                <CardHeader>
                  <CardTitle>AI Providers</CardTitle>
                  <CardDescription>Add a key for any provider. Keys are encrypted (AES-256-GCM) before storage. Verify checks the key works before you rely on it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {providers.map((p, i) => {
                    const configured = user?.settings?.hasApiKeys?.[p.id]
                    const preview = user?.settings?.keyPreviews?.[p.id]
                    const v = verify[p.id]
                    return (
                      <div key={p.id}>
                        {i > 0 && <Separator className="mb-6" />}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Label htmlFor={`${p.id}-key`}>{p.name}</Label>
                            <div className="flex items-center gap-2">
                              {configured && (
                                <>
                                  <span className="text-xs text-muted-foreground font-mono">{preview || '••••'}</span>
                                  <Badge variant="secondary" className="text-green-600"><Check className="h-3 w-3 mr-1" /> Configured</Badge>
                                </>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">{p.description}</p>

                          {p.requiresBaseUrl && (
                            <Input
                              placeholder="Base URL, e.g. http://localhost:11434/v1"
                              value={preferences.customBaseUrl || ''}
                              onChange={(e) => setPreferences(prev => ({ ...prev, customBaseUrl: e.target.value }))}
                              className="mb-1"
                              aria-label="Custom base URL"
                            />
                          )}

                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                id={`${p.id}-key`}
                                type={showKeys[p.id] ? 'text' : 'password'}
                                placeholder={configured ? 'Enter new key to replace…' : p.keyPlaceholder}
                                value={apiKeys[p.id] || ''}
                                onChange={(e) => { setApiKeys(prev => ({ ...prev, [p.id]: e.target.value })); setVerify(prev => ({ ...prev, [p.id]: undefined })) }}
                              />
                              <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                                onClick={() => toggleShowKey(p.id)} aria-label={showKeys[p.id] ? 'Hide key' : 'Show key'}>
                                {showKeys[p.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                            <AsyncButton variant="outline" onClick={() => verifyKey(p.id)} disabled={!apiKeys[p.id]}>
                              Verify
                            </AsyncButton>
                          </div>

                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-xs text-muted-foreground">
                              {p.keyHint ? `${p.keyHint} · ` : ''}
                              <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                                Get a key <ExternalLink className="h-3 w-3" />
                              </a>
                            </p>
                            {v?.status === 'valid' && <span className="text-xs text-green-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Key works</span>}
                            {v?.status === 'invalid' && <span className="text-xs text-destructive inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {v.msg || 'Invalid'}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <AsyncButton onClick={handleSaveApiKeys} successLabel="Saved" disabled={savingKeys}>
                    <Save className="h-4 w-4 mr-2" /> Save API Keys
                  </AsyncButton>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
