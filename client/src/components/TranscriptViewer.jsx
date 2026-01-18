import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, Search, Clock, FileText, Copy, Check, Mic } from 'lucide-react'

export function TranscriptViewer({ podcastId, onClose }) {
  const [transcript, setTranscript] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        const res = await fetch(`/api/podcasts/${podcastId}`)
        const data = await res.json()
        setTranscript(data)
      } catch (error) {
        console.error('Error fetching transcript:', error)
      } finally {
        setLoading(false)
      }
    }

    if (podcastId) fetchTranscript()
  }, [podcastId])

  // Parse transcript content into structured segments
  const segments = useMemo(() => {
    if (!transcript?.content) return []

    const lines = transcript.content.split('\n')
    const parsed = []
    let currentSpeaker = ''
    let currentText = ''
    let currentTime = ''

    for (const line of lines) {
      const speakerMatch = line.match(/^([^(]+)\s*\((\d{1,2}:\d{2}:\d{2})\):?\s*(.*)/)

      if (speakerMatch) {
        if (currentSpeaker && currentText.trim()) {
          parsed.push({ speaker: currentSpeaker, time: currentTime, text: currentText.trim() })
        }
        currentSpeaker = speakerMatch[1].trim()
        currentTime = speakerMatch[2]
        currentText = speakerMatch[3] || ''
      } else if (line.trim()) {
        currentText += ' ' + line.trim()
      }
    }

    if (currentSpeaker && currentText.trim()) {
      parsed.push({ speaker: currentSpeaker, time: currentTime, text: currentText.trim() })
    }

    return parsed
  }, [transcript?.content])

  // Filter segments by search
  const filteredSegments = useMemo(() => {
    if (!searchQuery) return segments
    const query = searchQuery.toLowerCase()
    return segments.filter(s =>
      s.text.toLowerCase().includes(query) ||
      s.speaker.toLowerCase().includes(query)
    )
  }, [segments, searchQuery])

  // Highlight search term
  const highlightText = useCallback((text, query) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-primary/20 text-primary px-0.5 rounded">{part}</mark>
        : part
    )
  }, [])

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcript?.content || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!transcript) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-muted-foreground">Transcript not found</p>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[85vh]">
      {/* Header */}
      <header className="flex items-start justify-between p-6 border-b border-border/50 flex-shrink-0">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Mic className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight truncate">{transcript.guest}</h2>
            <p className="text-sm text-muted-foreground">Lenny's Podcast</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {transcript.estimatedDuration}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <FileText className="h-3 w-3" />
                {transcript.wordCount?.toLocaleString()} words
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <Button variant="ghost" size="icon" onClick={copyTranscript} className="h-9 w-9">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Search */}
      <div className="p-4 border-b border-border/50 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-accent/50 border-0 h-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-2">
            {filteredSegments.length} segment{filteredSegments.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {filteredSegments.map((segment, index) => (
            <div key={index} className="group">
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-medium ${
                  segment.speaker.includes('Lenny') ? 'text-primary' : 'text-foreground'
                }`}>
                  {segment.speaker}
                </span>
                <span className="text-xs text-muted-foreground font-mono bg-accent px-2 py-0.5 rounded">
                  {segment.time}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground pl-4 border-l-2 border-border group-hover:border-primary/50 transition-colors">
                {highlightText(segment.text, searchQuery)}
              </p>
            </div>
          ))}
          {filteredSegments.length === 0 && searchQuery && (
            <div className="text-center py-12 text-muted-foreground">
              No segments matching "{searchQuery}"
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <footer className="flex items-center justify-between px-6 h-12 border-t border-border/50 text-xs text-muted-foreground flex-shrink-0">
        <span>{segments.length} segments total</span>
        <span>Esc to close</span>
      </footer>
    </div>
  )
}
