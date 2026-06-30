import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChatMessage } from './ChatMessage'
import {
  Send, Square, Loader2, MessageSquare, X, Minimize2, Maximize2,
  Settings, AlertCircle, Plus, Search as SearchIcon, BookOpen, PenLine, RotateCcw
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const STAGE_META = {
  rewriting: { icon: RotateCcw, label: () => 'Refining your question…' },
  searching: { icon: SearchIcon, label: (m) => (m.semanticUsed ? 'Searching (semantic + keyword)…' : 'Searching the knowledge base…') },
  reading: { icon: BookOpen, label: (m) => `Found ${m.totalFound ?? ''} sources · reading the most relevant…` },
  writing: { icon: PenLine, label: () => 'Writing…' }
}

// Pre-token progress: which stage the assistant turn is in, plus the keywords it matched.
function StageRow({ msg }) {
  const meta = STAGE_META[msg.stage] || STAGE_META.searching
  const Icon = meta.icon
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Loader2 className="h-4 w-4 text-white animate-spin" />
        </div>
      </div>
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-2xl px-4 py-3 bg-muted/60 border border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            <span>{meta.label(msg)}</span>
          </div>
          {msg.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {msg.keywords.slice(0, 8).map((k, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-background/60 text-muted-foreground">{k}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChatBox({ isFloating = false, onClose }) {
  const { user, isAuthenticated, authFetch } = useAuth()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [provider, setProvider] = useState(user?.settings?.preferences?.defaultAIProvider || 'openai')
  const [providers, setProviders] = useState([])
  const [minimized, setMinimized] = useState(false)

  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const idRef = useRef(0)
  const messagesRef = useRef([])
  messagesRef.current = messages

  const mkId = () => `m${idRef.current++}`

  useEffect(() => { if (isAuthenticated) fetchProviders() }, [isAuthenticated])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])
  useEffect(() => { if (!minimized && !streaming) inputRef.current?.focus() }, [minimized, streaming])

  const fetchProviders = async () => {
    try {
      const response = await authFetch('/api/chat/providers')
      if (response.ok) {
        const data = await response.json()
        setProviders(data)
        if (user?.settings?.preferences?.defaultAIProvider) {
          setProvider(user.settings.preferences.defaultAIProvider)
        }
      }
    } catch (err) {
      console.error('Error fetching providers:', err)
    }
  }

  const updateMsg = useCallback((id, patch) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m))
  }, [])

  // Build the last-10 completed-turn history for context.
  const buildHistory = () => messagesRef.current
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && m.status !== 'error')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }))

  const runStream = useCallback(async (assistantId, text, history) => {
    setError(null)
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await authFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, provider, history }),
        signal: controller.signal
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        if (data.code === 'NO_API_KEY') {
          setError(`No API key configured for ${data.provider}. Add one in Settings.`)
        } else if (data.code === 'CUSTOM_NO_BASE_URL') {
          setError('Your custom provider needs a Base URL. Add it in Settings.')
        } else {
          setError(data.error || 'Failed to start the response.')
        }
        updateMsg(assistantId, { status: 'error', error: data.error || 'Failed to get a response.', errorCode: data.code })
        setInput(prev => prev || text)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          let event = 'message'
          let dataStr = ''
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
          }
          if (!dataStr) continue
          let data
          try { data = JSON.parse(dataStr) } catch { continue }
          handleEvent(assistantId, event, data)
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        updateMsg(assistantId, { status: 'cancelled' })
      } else if (err.message === 'Session expired') {
        setError('Session expired. Please log in again.')
        updateMsg(assistantId, { status: 'error', error: 'Session expired.' })
        setInput(prev => prev || text)
      } else {
        updateMsg(assistantId, { status: 'error', error: 'Connection lost. Check your network and retry.' })
        setInput(prev => prev || text)
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [provider, authFetch, updateMsg])

  const handleEvent = (id, event, data) => {
    switch (event) {
      case 'stage':
        updateMsg(id, m => ({
          stage: data.stage,
          totalFound: data.totalFound ?? m.totalFound,
          keywords: data.keywords ?? m.keywords,
          semanticUsed: data.semanticUsed ?? m.semanticUsed
        }))
        break
      case 'sources':
        updateMsg(id, { sources: data.sources || [] })
        break
      case 'delta':
        updateMsg(id, m => ({ content: (m.content || '') + (data.text || ''), stage: 'writing' }))
        break
      case 'done':
        updateMsg(id, { status: 'done', provider: data.provider, model: data.model, usage: data.usage })
        break
      case 'error':
        updateMsg(id, { status: 'error', error: data.error, errorCode: data.code })
        if (data.code === 'NO_API_KEY' || data.code === 'INVALID_KEY' || data.code === 'CUSTOM_NO_BASE_URL') {
          setError(data.error)
        }
        break
      default:
        break
    }
  }

  const sendMessage = () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const assistantId = mkId()
    const history = buildHistory()
    setMessages(prev => [
      ...prev,
      { id: mkId(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', status: 'streaming', stage: 'searching', sources: [], _src: text }
    ])
    runStream(assistantId, text, history)
  }

  // Retry / regenerate: re-run the turn for an assistant message using the
  // preceding user message and the history up to that point.
  const rerun = (assistantId) => {
    if (streaming) return
    const msgs = messagesRef.current
    const aIdx = msgs.findIndex(m => m.id === assistantId)
    if (aIdx < 1) return
    const userMsg = msgs[aIdx - 1]
    if (!userMsg || userMsg.role !== 'user') return
    const history = msgs.slice(0, aIdx - 1)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && m.status !== 'error')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))
    updateMsg(assistantId, { content: '', status: 'streaming', stage: 'searching', sources: [], error: null })
    runStream(assistantId, userMsg.content, history)
  }

  const handleStop = () => abortRef.current?.abort()

  const newChat = () => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!streaming) sendMessage()
    }
  }

  const selectedProviderObj = providers.find(p => p.id === provider)
  const selectedProviderHasKey = selectedProviderObj?.hasApiKey
  const completedTurns = messages.filter(m => m.content && m.status !== 'error').length
  const historyTruncated = completedTurns > 10

  if (!isAuthenticated) return null

  const content = (
    <>
      <CardHeader className="pb-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Chat</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={newChat} title="New chat" aria-label="New chat">
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {isFloating && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMinimized(!minimized)} aria-label={minimized ? 'Expand' : 'Minimize'}>
                  {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close chat">
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        {!minimized && (
          <div className="flex items-center gap-2 mt-2">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-[200px] h-8">
                <SelectValue placeholder="Select AI" />
              </SelectTrigger>
              <SelectContent>
                {providers.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      {p.hasApiKey
                        ? <Badge variant="outline" className="h-4 text-[10px]">Ready</Badge>
                        : <Badge variant="outline" className="h-4 text-[10px] text-muted-foreground">No Key</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/settings')} title="Settings" aria-label="Settings">
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
                  <p className="text-sm mt-1">Grounded in articles and Lenny's Podcast transcripts — answers cite their sources.</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="text-muted-foreground">Try asking:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {['What does Brian Chesky say about product management?', 'How should I prioritize features?', 'What are best practices for user research?'].map((q, i) => (
                        <Badge key={i} variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => setInput(q)}>
                          {['Brian Chesky on PM', 'Feature prioritization', 'User research'][i]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyTruncated && (
                    <p className="text-[11px] text-center text-muted-foreground">Only the last 10 messages are sent as context.</p>
                  )}
                  {messages.map((msg) => {
                    if (msg.role === 'assistant' && msg.status === 'streaming' && !msg.content) {
                      return <StageRow key={msg.id} msg={msg} />
                    }
                    return (
                      <div key={msg.id}>
                        <ChatMessage
                          message={msg}
                          user={user}
                          onRegenerate={msg.role === 'assistant' && msg.status === 'done' && !streaming ? () => rerun(msg.id) : undefined}
                        />
                        {msg.role === 'assistant' && msg.status === 'error' && (
                          <div className="ml-11 mt-1 flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1">{msg.error || 'Something went wrong.'}</span>
                            {!streaming && (
                              <Button variant="outline" size="sm" className="h-7" onClick={() => rerun(msg.id)}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Retry
                              </Button>
                            )}
                          </div>
                        )}
                        {msg.role === 'assistant' && msg.status === 'cancelled' && (
                          <div className="ml-11 mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Stopped.</span>
                            {!streaming && (
                              <Button variant="ghost" size="sm" className="h-7 text-primary" onClick={() => rerun(msg.id)}>
                                Resume
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>

          {error && (
            <div className="px-4 py-2 border-t bg-destructive/10">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{error}</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => navigate('/settings')}>
                  Settings
                </Button>
              </div>
            </div>
          )}

          <div className="p-4 border-t flex-shrink-0">
            {!selectedProviderHasKey ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm text-muted-foreground">
                  Add an API key for {selectedProviderObj?.name || provider} to start chatting
                </span>
                <Button size="sm" onClick={() => navigate('/settings')}>Add Key</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="Ask about product management..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={streaming}
                  aria-label="Chat message"
                  className="flex-1"
                />
                {streaming ? (
                  <Button onClick={handleStop} variant="outline" title="Stop generating" aria-label="Stop generating">
                    <Square className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button onClick={sendMessage} disabled={!input.trim()} aria-label="Send message">
                    <Send className="h-4 w-4" />
                  </Button>
                )}
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
