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
  Settings, AlertCircle, Plus, Search as SearchIcon, BookOpen, PenLine, RotateCcw, ArrowDown
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const STAGE_META = {
  rewriting: { icon: RotateCcw, label: () => 'Refining your question…' },
  searching: { icon: SearchIcon, label: (m) => (m.semanticUsed ? 'Searching (semantic + keyword)…' : 'Searching the knowledge base…') },
  reading: { icon: BookOpen, label: (m) => `Found ${m.totalFound ?? ''} sources · reading the most relevant…` },
  writing: { icon: PenLine, label: () => 'Writing…' }
}

// Generic, always-useful follow-ups shown after an answer to keep the conversation moving.
const FOLLOWUPS = ['Give a concrete example', 'How does this differ for B2B vs B2C?', 'What are the main risks or trade-offs?', 'Summarize the key takeaways']

// In-chat model switcher. Lists the provider's models and, for providers that
// allow it (OpenRouter / custom), lets the user free-type any current model id.
function ModelPicker({ providerObj, value, onChange }) {
  const models = providerObj?.models || []
  const allowCustom = !!providerObj?.allowCustomModel
  const inList = models.some(m => m.id === value)
  const [custom, setCustom] = useState(false)
  const [draft, setDraft] = useState(value || '')
  useEffect(() => { setDraft(value || '') }, [value])

  const useInput = custom || models.length === 0 || (!inList && !!value)
  if (useInput) {
    const commit = () => { const v = draft.trim(); if (v) onChange(v) }
    return (
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
          placeholder="model id, e.g. deepseek/deepseek-chat"
          aria-label="Model id"
          className="h-7 text-xs"
        />
        {models.length > 0 && (
          <button type="button" className="text-[11px] text-primary hover:underline flex-shrink-0" onClick={() => { setCustom(false); if (!inList && models[0]) onChange(models[0].id) }}>list</button>
        )}
      </div>
    )
  }
  return (
    <Select value={value} onValueChange={(v) => v === '__custom__' ? setCustom(true) : onChange(v)}>
      <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue placeholder="Select model" /></SelectTrigger>
      <SelectContent>
        {models.map(m => (
          <SelectItem key={m.id} value={m.id} description={m.description}>
            {m.name}{m.context ? <span className="text-muted-foreground"> · {m.context}</span> : null}
          </SelectItem>
        ))}
        {allowCustom && <SelectItem value="__custom__">Custom model…</SelectItem>}
      </SelectContent>
    </Select>
  )
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
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
  const { user, isAuthenticated, authFetch, updateSettings } = useAuth()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [provider, setProvider] = useState(user?.settings?.preferences?.defaultAIProvider || 'openai')
  const [providers, setProviders] = useState([])
  const [minimized, setMinimized] = useState(false)
  const [model, setModel] = useState('')
  const [atBottom, setAtBottom] = useState(true)

  const getViewport = () => scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]')

  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const idRef = useRef(0)
  const cardRef = useRef(null)
  const messagesRef = useRef([])
  messagesRef.current = messages

  const mkId = () => `m${idRef.current++}`

  useEffect(() => { if (isAuthenticated) fetchProviders() }, [isAuthenticated])
  // Autoscroll only when the user is already at the bottom — no yank-back if they scroll up to read.
  useEffect(() => { const vp = getViewport(); if (vp && atBottom) vp.scrollTop = vp.scrollHeight }, [messages, atBottom])
  useEffect(() => { if (!minimized && !streaming) inputRef.current?.focus() }, [minimized, streaming])

  // Track whether the viewport is near the bottom (drives autoscroll + jump-to-latest).
  useEffect(() => {
    const vp = getViewport(); if (!vp) return
    const onScroll = () => setAtBottom(vp.scrollHeight - vp.scrollTop - vp.clientHeight < 80)
    vp.addEventListener('scroll', onScroll, { passive: true })
    return () => vp.removeEventListener('scroll', onScroll)
  }, [minimized])

  // Keep the active model synced to the selected provider (saved pref → provider default).
  useEffect(() => {
    const po = providers.find(p => p.id === provider)
    setModel(user?.settings?.preferences?.[`${provider}Model`] || po?.defaultModel || '')
  }, [provider, providers, user])

  // Persist the conversation locally so a refresh doesn't lose it.
  const storeKey = user?.id ? `ps_chat_${user.id}` : null
  useEffect(() => {
    if (!storeKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null')
      if (Array.isArray(saved) && saved.length) {
        setMessages(saved)
        const maxId = saved.reduce((mx, m) => { const n = parseInt(String(m.id).replace('m', ''), 10); return isNaN(n) ? mx : Math.max(mx, n) }, 0)
        idRef.current = maxId + 1
      }
    } catch {}
  }, [storeKey])
  useEffect(() => {
    if (!storeKey) return
    try { localStorage.setItem(storeKey, JSON.stringify(messages.filter(m => m.status !== 'streaming').slice(-40))) } catch {}
  }, [messages, storeKey])

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

  const handleModelChange = (m) => {
    setModel(m)
    // Persist so the choice sticks across reloads and Settings stays in sync (fire-and-forget).
    if (updateSettings && m) updateSettings({ ...(user?.settings?.preferences || {}), [`${provider}Model`]: m })
  }
  const autoGrow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 128) + 'px' }

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
        body: JSON.stringify({ message: text, provider, model, history }),
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
  }, [provider, model, authFetch, updateMsg])

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

  const sendText = (raw) => {
    const text = (raw || '').trim()
    if (!text || streaming) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setAtBottom(true)
    const assistantId = mkId()
    const history = buildHistory()
    setMessages(prev => [
      ...prev,
      { id: mkId(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', status: 'streaming', stage: 'searching', sources: [], _src: text }
    ])
    runStream(assistantId, text, history)
  }
  const sendMessage = () => sendText(input)

  // Best-effort answer feedback (👍/👎); attaches the preceding question for context.
  const sendFeedback = useCallback(async (msg, rating) => {
    try {
      const all = messagesRef.current
      const idx = all.findIndex(m => m.id === msg.id)
      const userMsg = idx > 0 ? all[idx - 1] : null
      await authFetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, provider: msg.provider, model: msg.model, query: userMsg?.content || '', answer: msg.content || '' })
      })
    } catch { /* feedback is best-effort — never surface an error */ }
  }, [authFetch])

  // Keep keyboard focus inside the floating widget while it's open (a11y).
  const onTrapKeyDown = (e) => {
    if (e.key !== 'Tab' || !isFloating || !cardRef.current) return
    const list = Array.from(cardRef.current.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null)
    if (!list.length) return
    const first = list[0], last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
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
    } else if (e.key === 'Escape' && streaming) {
      e.preventDefault()
      handleStop()
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
          <>
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
            {selectedProviderObj && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] text-muted-foreground flex-shrink-0">Model</span>
                <ModelPicker providerObj={selectedProviderObj} value={model} onChange={handleModelChange} />
              </div>
            )}
          </>
        )}
      </CardHeader>

      {!minimized && (
        <>
          <CardContent className="flex-1 p-0 overflow-hidden relative">
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
                          onFeedback={msg.role === 'assistant' && msg.status === 'done' ? (rating) => sendFeedback(msg, rating) : undefined}
                        />
                        {msg.role === 'assistant' && msg.status === 'error' && (
                          <div className="ml-11 mt-1 flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1">{msg.error || 'Something went wrong.'}</span>
                            {!streaming && ['NO_ENDPOINTS', 'INVALID_KEY', 'NO_API_KEY', 'CUSTOM_NO_BASE_URL'].includes(msg.errorCode) ? (
                              <Button variant="outline" size="sm" className="h-7" onClick={() => navigate('/settings')}>
                                <Settings className="h-3 w-3 mr-1" /> {msg.errorCode === 'NO_ENDPOINTS' ? 'Change model' : 'Open settings'}
                              </Button>
                            ) : !streaming ? (
                              <Button variant="outline" size="sm" className="h-7" onClick={() => rerun(msg.id)}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Retry
                              </Button>
                            ) : null}
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
                  {!streaming && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.status === 'done' && (
                    <div className="flex flex-wrap gap-1.5 pt-1 ml-11">
                      {FOLLOWUPS.map((f, i) => (
                        <button key={i} onClick={() => sendText(f)} className="text-xs px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
            {!atBottom && messages.length > 0 && (
              <button
                onClick={() => { const vp = getViewport(); if (vp) vp.scrollTop = vp.scrollHeight; setAtBottom(true) }}
                className="absolute left-1/2 -translate-x-1/2 bottom-3 z-10 inline-flex items-center gap-1 rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow hover:text-foreground"
                aria-label="Scroll to latest message"
              >
                <ArrowDown className="h-3 w-3" /> Latest
              </button>
            )}
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
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  placeholder="Ask about product management…"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoGrow(e.target) }}
                  onKeyDown={handleKeyDown}
                  disabled={streaming}
                  aria-label="Chat message"
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  className="flex-1 resize-none max-h-32 min-h-[40px] rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
      <Card ref={cardRef} onKeyDown={onTrapKeyDown} role="dialog" aria-label="AI chat" className={`fixed z-50 shadow-2xl flex flex-col ${
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
