import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Key, Palette, Save, Check, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

export function SettingsPage() {
  const { user, isAuthenticated, updateSettings, saveApiKeys, loading } = useAuth()
  const navigate = useNavigate()

  const [preferences, setPreferences] = useState({
    defaultAIProvider: 'openai',
    openaiModel: 'gpt-4o',
    anthropicModel: 'claude-sonnet-4-20250514',
    googleModel: 'gemini-1.5-pro',
    theme: 'dark'
  })

  // Available models for each provider
  const models = {
    openai: [
      { value: 'gpt-4o', label: 'GPT-4o (Latest)', description: 'Most capable, multimodal' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Fast and affordable' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Previous flagship' },
      { value: 'gpt-4', label: 'GPT-4', description: 'Original GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Fast, cost-effective' },
      { value: 'o1', label: 'o1', description: 'Advanced reasoning' },
      { value: 'o1-mini', label: 'o1 Mini', description: 'Fast reasoning' },
      { value: 'o1-preview', label: 'o1 Preview', description: 'Reasoning preview' },
    ],
    anthropic: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Latest, best balanced' },
      { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', description: 'Most powerful' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: 'Fast and capable' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', description: 'Fastest, affordable' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', description: 'Previous flagship' },
      { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', description: 'Balanced performance' },
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', description: 'Fast responses' },
    ],
    google: [
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Most capable' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
      { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B', description: 'Lightweight' },
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Exp)', description: 'Experimental' },
      { value: 'gemini-pro', label: 'Gemini Pro', description: 'Previous generation' },
    ]
  }

  const [apiKeys, setApiKeys] = useState({
    openai: '',
    anthropic: '',
    google: ''
  })

  const [showKeys, setShowKeys] = useState({
    openai: false,
    anthropic: false,
    google: false
  })

  const [saving, setSaving] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, loading, navigate])

  useEffect(() => {
    if (user?.settings?.preferences) {
      setPreferences(prev => ({
        ...prev,
        ...user.settings.preferences
      }))
    }
  }, [user])

  const handleSavePreferences = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const result = await updateSettings(preferences)

    if (result.success) {
      setSuccess('Preferences saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    } else {
      setError(result.error || 'Failed to save preferences')
    }

    setSaving(false)
  }

  const handleSaveApiKeys = async () => {
    setSavingKeys(true)
    setError(null)
    setSuccess(null)

    // Only send keys that have values
    const keysToSave = {}
    for (const [provider, key] of Object.entries(apiKeys)) {
      if (key.trim()) {
        keysToSave[provider] = key.trim()
      }
    }

    if (Object.keys(keysToSave).length === 0) {
      setError('Please enter at least one API key')
      setSavingKeys(false)
      return
    }

    const result = await saveApiKeys(keysToSave)

    if (result.success) {
      setSuccess('API keys saved successfully')
      setApiKeys({ openai: '', anthropic: '', google: '' }) // Clear inputs
      setTimeout(() => setSuccess(null), 3000)
    } else {
      setError(result.error || 'Failed to save API keys')
    }

    setSavingKeys(false)
  }

  const toggleShowKey = (provider) => {
    setShowKeys(prev => ({
      ...prev,
      [provider]: !prev[provider]
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage your account preferences and API keys
            </p>
          </div>

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-600">
              <Check className="h-4 w-4" />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <Tabs defaultValue="preferences" className="space-y-4">
            <TabsList>
              <TabsTrigger value="preferences">
                <Palette className="h-4 w-4 mr-2" />
                Preferences
              </TabsTrigger>
              <TabsTrigger value="apikeys">
                <Key className="h-4 w-4 mr-2" />
                API Keys
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preferences">
              <Card>
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                  <CardDescription>
                    Customize your experience
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="defaultAIProvider">Default AI Provider</Label>
                    <Select
                      value={preferences.defaultAIProvider}
                      onValueChange={(value) => setPreferences(prev => ({ ...prev, defaultAIProvider: value }))}
                    >
                      <SelectTrigger id="defaultAIProvider">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This will be used as the default provider for AI chat
                    </p>
                  </div>

                  <Separator />

                  {/* Model Selection Section */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Model Selection</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Choose which model to use for each provider
                      </p>
                    </div>

                    {/* OpenAI Model */}
                    <div className="space-y-2">
                      <Label htmlFor="openaiModel">OpenAI Model</Label>
                      <Select
                        value={preferences.openaiModel}
                        onValueChange={(value) => setPreferences(prev => ({ ...prev, openaiModel: value }))}
                      >
                        <SelectTrigger id="openaiModel">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {models.openai.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              <div className="flex flex-col">
                                <span>{model.label}</span>
                                <span className="text-xs text-muted-foreground">{model.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Anthropic Model */}
                    <div className="space-y-2">
                      <Label htmlFor="anthropicModel">Anthropic Model</Label>
                      <Select
                        value={preferences.anthropicModel}
                        onValueChange={(value) => setPreferences(prev => ({ ...prev, anthropicModel: value }))}
                      >
                        <SelectTrigger id="anthropicModel">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {models.anthropic.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              <div className="flex flex-col">
                                <span>{model.label}</span>
                                <span className="text-xs text-muted-foreground">{model.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Google Model */}
                    <div className="space-y-2">
                      <Label htmlFor="googleModel">Google AI Model</Label>
                      <Select
                        value={preferences.googleModel}
                        onValueChange={(value) => setPreferences(prev => ({ ...prev, googleModel: value }))}
                      >
                        <SelectTrigger id="googleModel">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {models.google.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              <div className="flex flex-col">
                                <span>{model.label}</span>
                                <span className="text-xs text-muted-foreground">{model.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="theme">Theme</Label>
                    <Select
                      value={preferences.theme}
                      onValueChange={(value) => setPreferences(prev => ({ ...prev, theme: value }))}
                    >
                      <SelectTrigger id="theme">
                        <SelectValue placeholder="Select theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose between light and dark mode, or use your system preference
                    </p>
                  </div>

                  <Button onClick={handleSavePreferences} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="apikeys">
              <Card>
                <CardHeader>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>
                    Add your AI provider API keys to use the chat feature.
                    Keys are encrypted before being stored.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* OpenAI */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="openai-key">OpenAI API Key</Label>
                      {user?.settings?.hasApiKeys?.openai && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            {user?.settings?.keyPreviews?.openai || 'sk-...'}
                          </span>
                          <Badge variant="secondary" className="text-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Configured
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="openai-key"
                        type={showKeys.openai ? 'text' : 'password'}
                        placeholder={user?.settings?.hasApiKeys?.openai ? 'Enter new key to replace...' : 'sk-...'}
                        value={apiKeys.openai}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => toggleShowKey('openai')}
                      >
                        {showKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get your API key from{' '}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        platform.openai.com
                      </a>
                    </p>
                  </div>

                  <Separator />

                  {/* Anthropic */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="anthropic-key">Anthropic API Key</Label>
                      {user?.settings?.hasApiKeys?.anthropic && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            {user?.settings?.keyPreviews?.anthropic || 'sk-ant-...'}
                          </span>
                          <Badge variant="secondary" className="text-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Configured
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="anthropic-key"
                        type={showKeys.anthropic ? 'text' : 'password'}
                        placeholder={user?.settings?.hasApiKeys?.anthropic ? 'Enter new key to replace...' : 'sk-ant-...'}
                        value={apiKeys.anthropic}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => toggleShowKey('anthropic')}
                      >
                        {showKeys.anthropic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get your API key from{' '}
                      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        console.anthropic.com
                      </a>
                    </p>
                  </div>

                  <Separator />

                  {/* Google */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="google-key">Google AI API Key</Label>
                      {user?.settings?.hasApiKeys?.google && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            {user?.settings?.keyPreviews?.google || 'AIza...'}
                          </span>
                          <Badge variant="secondary" className="text-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Configured
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="google-key"
                        type={showKeys.google ? 'text' : 'password'}
                        placeholder={user?.settings?.hasApiKeys?.google ? 'Enter new key to replace...' : 'AIza...'}
                        value={apiKeys.google}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, google: e.target.value }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => toggleShowKey('google')}
                      >
                        {showKeys.google ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get your API key from{' '}
                      <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Google AI Studio
                      </a>
                    </p>
                  </div>

                  <Button onClick={handleSaveApiKeys} disabled={savingKeys}>
                    {savingKeys ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save API Keys
                  </Button>
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
