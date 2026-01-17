import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X, Search, Clock, FileText, Copy, Check } from 'lucide-react'

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

    if (podcastId) {
      fetchTranscript()
    }
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
      // Match pattern: "Speaker Name (00:00:00):"
      const speakerMatch = line.match(/^([^(]+)\s*\((\d{1,2}:\d{2}:\d{2})\):?\s*(.*)/)

      if (speakerMatch) {
        // Save previous segment
        if (currentSpeaker && currentText.trim()) {
          parsed.push({
            speaker: currentSpeaker,
            time: currentTime,
            text: currentText.trim()
          })
        }
        currentSpeaker = speakerMatch[1].trim()
        currentTime = speakerMatch[2]
        currentText = speakerMatch[3] || ''
      } else if (line.trim()) {
        currentText += ' ' + line.trim()
      }
    }

    // Add last segment
    if (currentSpeaker && currentText.trim()) {
      parsed.push({
        speaker: currentSpeaker,
        time: currentTime,
        text: currentText.trim()
      })
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

  // Highlight search term in text
  const highlightText = useCallback((text, query) => {
    if (!query) return text

    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 px-0.5 rounded">{part}</mark>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
    <div className="flex flex-col h-[80vh]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between p-4 border-b bg-gradient-to-r from-primary/10 to-secondary/10">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">{transcript.guest}</h2>
          <p className="text-sm text-muted-foreground">Lenny's Podcast</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {transcript.estimatedDuration}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {transcript.wordCount?.toLocaleString()} words
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={copyTranscript}
            title="Copy transcript"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 p-4 border-b bg-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search in transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-2">
            Found {filteredSegments.length} segment{filteredSegments.length !== 1 ? 's' : ''} matching "{searchQuery}"
          </p>
        )}
      </div>

      {/* Transcript Content - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4 space-y-4">
          {filteredSegments.map((segment, index) => (
            <div key={index} className="group">
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-semibold ${
                  segment.speaker === 'Lenny' || segment.speaker.includes('Lenny') ? 'text-primary' : 'text-secondary'
                }`}>
                  {segment.speaker}
                </span>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                  {segment.time}
                </span>
              </div>
              <p className="text-sm leading-relaxed pl-3 border-l-2 border-muted group-hover:border-primary/50 transition-colors">
                {highlightText(segment.text, searchQuery)}
              </p>
            </div>
          ))}
          {filteredSegments.length === 0 && searchQuery && (
            <div className="text-center py-8 text-muted-foreground">
              No segments found matching "{searchQuery}"
            </div>
          )}
        </div>
      </div>

      {/* Footer with segment count */}
      <div className="flex-shrink-0 p-3 border-t bg-muted/30 text-center text-xs text-muted-foreground">
        {filteredSegments.length} segments • Scroll to read full transcript
      </div>
    </div>
  )
}
