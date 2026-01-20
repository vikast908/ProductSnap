import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChatMessage } from './ChatMessage'
import { Send, Loader2, MessageSquare, X, Minimize2, Maximize2, Settings, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function ChatBox({ isFloating = false, onClose }) {
  const { user, isAuthenticated, authFetch } = useAuth()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [provider, setProvider] = useState(user?.settings?.preferences?.defaultAIProvider || 'openai')
  const [providers, setProviders] = useState([])
  const [minimized, setMinimized] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Fetch available providers
  useEffect(() => {
    if (isAuthenticated) {
      fetchProviders()
    }
  }, [isAuthenticated])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (!minimized && inputRef.current) {
      inputRef.current.focus()
    }
  }, [minimized])

  const fetchProviders = async () => {
    try {
      const response = await authFetch('/api/chat/providers')
      if (response.ok) {
        const data = await response.json()
        setProviders(data)
        // Set default provider if user has a preference
        if (user?.settings?.preferences?.defaultAIProvider) {
          setProvider(user.settings.preferences.defaultAIProvider)
        }
      }
    } catch (err) {
      console.error('Error fetching providers:', err)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setError(null)

    // Add user message to chat
    const newUserMessage = { role: 'user', content: userMessage }
    setMessages(prev => [...prev, newUserMessage])

    setLoading(true)

    try {
      // Build history for context (last 10 messages)
      const history = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }))

      const response = await authFetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          provider,
          history
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Add assistant message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content,
          sources: data.sources,
          provider: data.provider,
          model: data.model
        }])
      } else {
        // Handle errors
        if (data.code === 'NO_API_KEY') {
          setError(`No API key configured for ${data.provider}. Please add one in Settings.`)
        } else {
          setError(data.error || 'Failed to get response')
        }
      }
    } catch (err) {
      console.error('Chat error:', err)
      if (err.message === 'Session expired') {
        setError('Session expired. Please log in again.')
      } else {
        setError('Failed to send message. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const selectedProviderHasKey = providers.find(p => p.id === provider)?.hasApiKey

  if (!isAuthenticated) {
    return null
  }

  const content = (
    <>
      <CardHeader className="pb-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Chat</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isFloating && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setMinimized(!minimized)}
                >
                  {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        {!minimized && (
          <div className="flex items-center gap-2 mt-2">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="Select AI" />
              </SelectTrigger>
              <SelectContent>
                {providers.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      {p.hasApiKey ? (
                        <Badge variant="outline" className="h-4 text-[10px]">Ready</Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 text-[10px] text-muted-foreground">No Key</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate('/settings')}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>

      {!minimized && (
        <>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                  <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                  <p className="font-medium">Ask about product management</p>
                  <p className="text-sm mt-1">
                    I have access to articles and Lenny's Podcast transcripts
                  </p>
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="text-muted-foreground">Try asking:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => setInput("What does Brian Chesky say about product management?")}
                      >
                        Brian Chesky on PM
                      </Badge>
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => setInput("How should I prioritize features?")}
                      >
                        Feature prioritization
                      </Badge>
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => setInput("What are best practices for user research?")}
                      >
                        User research
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
                    <ChatMessage key={idx} message={msg} user={user} />
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>

          {error && (
            <div className="px-4 py-2 border-t bg-destructive/10">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
                {error.includes('Settings') && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-primary"
                    onClick={() => navigate('/settings')}
                  >
                    Go to Settings
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="p-4 border-t flex-shrink-0">
            {!selectedProviderHasKey ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm text-muted-foreground">
                  Add an API key for {providers.find(p => p.id === provider)?.name || provider} to start chatting
                </span>
                <Button size="sm" onClick={() => navigate('/settings')}>
                  Add Key
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="Ask about product management..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={loading || !input.trim()}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )

  if (isFloating) {
    return (
      <Card className={`fixed z-50 shadow-2xl flex flex-col ${
        minimized
          ? 'bottom-4 right-4 w-[280px] sm:w-[300px] h-auto'
          : 'bottom-0 right-0 sm:bottom-4 sm:right-4 w-full sm:w-[400px] h-[100dvh] sm:h-[600px] rounded-none sm:rounded-xl'
      }`}>
        {content}
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      {content}
    </Card>
  )
}

export default ChatBox
