import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Bot, User, ExternalLink, Mic, FileText, Copy, Check, ChevronDown, ChevronUp, Circle, RotateCcw } from 'lucide-react'
import { useState } from 'react'

function RelevanceIndicator({ relevance }) {
  const colors = { high: 'text-green-500', medium: 'text-yellow-500', low: 'text-muted-foreground/50' }
  return <Circle className={`h-2 w-2 fill-current ${colors[relevance] || colors.medium}`} title={`${relevance} relevance`} />
}

// Inline citation chip — links a claim to its numbered source.
function CitationChip({ n, source }) {
  const label = source.type === 'podcast' ? source.guest : source.title
  const title = `Source ${n}: ${label || 'source'}${source.url ? ' (opens in new tab)' : ''}`
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => source.url && window.open(source.url, '_blank', 'noopener')}
      className={`align-super text-[0.7em] font-semibold mx-0.5 px-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors ${source.url ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {n}
    </button>
  )
}

// Replace [n] tokens inside text nodes with clickable citation chips.
function renderCitations(children, sources) {
  if (!sources || sources.length === 0) return children
  const arr = Array.isArray(children) ? children : [children]
  return arr.flatMap((child, ci) => {
    if (typeof child !== 'string') return [child]
    return child.split(/(\[\d+\])/g).map((part, pi) => {
      const m = /^\[(\d+)\]$/.exec(part)
      if (m) {
        const num = parseInt(m[1], 10)
        const src = sources[num - 1]
        if (src) return <CitationChip key={`cite-${ci}-${pi}`} n={num} source={src} />
      }
      return part
    })
  })
}

function CodeBlock({ children, className, ...props }) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!className) {
    return <code className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-sm" {...props}>{children}</code>
  }

  return (
    <div className="relative group my-3">
      {language && (
        <div className="absolute top-0 left-0 px-2 py-1 text-xs text-muted-foreground bg-muted/50 rounded-tl-lg rounded-br-lg">{language}</div>
      )}
      <button
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute top-2 right-2 p-1.5 rounded bg-muted/80 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-[#0d1117] p-4 pt-8">
        <code className={className} {...props}>{children}</code>
      </pre>
    </div>
  )
}

function SourcesPanel({ sources }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const highRelevance = sources.filter(s => s.relevance === 'high')
  const mediumRelevance = sources.filter(s => s.relevance === 'medium')
  const defaultVisibleCount = 5
  const topSources = [...highRelevance, ...mediumRelevance].slice(0, defaultVisibleCount)
  const remainingSources = sources.slice(defaultVisibleCount)
  const hasMoreSources = remainingSources.length > 0
  const visibleSources = isExpanded ? sources : topSources

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex items-center gap-2 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors"
      >
        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <span>
          Sources ({sources.length})
          {highRelevance.length > 0 && <span className="ml-1 text-green-500">{highRelevance.length} highly relevant</span>}
        </span>
      </button>

      <div className={`space-y-1.5 ${isExpanded ? '' : 'max-h-[120px] overflow-hidden'}`}>
        {visibleSources.filter(s => s.relevance === 'high').length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleSources.filter(s => s.relevance === 'high').map((source, idx) => <SourceBadge key={`high-${idx}`} source={source} />)}
          </div>
        )}
        {visibleSources.filter(s => s.relevance === 'medium').length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleSources.filter(s => s.relevance === 'medium').map((source, idx) => <SourceBadge key={`med-${idx}`} source={source} />)}
          </div>
        )}
        {isExpanded && visibleSources.filter(s => s.relevance === 'low' || !s.relevance).length > 0 && (
          <div className="flex flex-wrap gap-1.5 opacity-60">
            {visibleSources.filter(s => s.relevance === 'low' || !s.relevance).map((source, idx) => <SourceBadge key={`low-${idx}`} source={source} />)}
          </div>
        )}
      </div>

      {hasMoreSources && !isExpanded && (
        <button onClick={() => setIsExpanded(true)} className="text-xs text-primary hover:underline">
          + {remainingSources.length} more sources
        </button>
      )}
    </div>
  )
}

function SourceBadge({ source }) {
  return (
    <Badge
      variant="outline"
      className="cursor-pointer hover:bg-muted flex items-center gap-1.5 text-xs py-0.5"
      onClick={() => source.url && window.open(source.url, '_blank', 'noopener')}
    >
      <span className="font-mono text-[10px] text-muted-foreground">{source.index}</span>
      <RelevanceIndicator relevance={source.relevance} />
      {source.type === 'podcast' ? <Mic className="h-3 w-3 text-purple-500" /> : <FileText className="h-3 w-3 text-blue-500" />}
      <span className="truncate max-w-[180px]">{source.type === 'podcast' ? source.guest : source.title}</span>
      {source.url && <ExternalLink className="h-2.5 w-2.5 opacity-50" />}
    </Badge>
  )
}

export function ChatMessage({ message, user, onRegenerate }) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const [copied, setCopied] = useState(false)
  const sources = message.sources || []

  const copyMessage = () => {
    navigator.clipboard.writeText(message.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Markdown renderers that run text through the citation linkifier.
  const cite = (children) => renderCitations(children, sources)

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isAssistant && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Bot className="h-4 w-4 text-white" />
          </div>
        </div>
      )}

      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-3 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/60 border border-border/50'}`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code: CodeBlock,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border-collapse border border-border rounded-lg overflow-hidden">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">{cite(children)}</th>,
                  td: ({ children }) => <td className="border border-border px-3 py-2">{cite(children)}</td>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/50 pl-4 my-3 italic text-muted-foreground">{children}</blockquote>,
                  ul: ({ children }) => <ul className="list-disc list-outside ml-6 my-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-outside ml-6 my-2 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{cite(children)}</li>,
                  h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1">{children}</h3>,
                  p: ({ children }) => <p className="leading-relaxed my-2">{cite(children)}</p>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>,
                  hr: () => <hr className="my-4 border-border" />,
                  strong: ({ children }) => <strong className="font-semibold">{cite(children)}</strong>,
                  em: ({ children }) => <em className="italic">{cite(children)}</em>,
                }}
              >
                {message.content || ''}
              </ReactMarkdown>
              {message.status === 'streaming' && (
                <span className="inline-block w-2 h-4 -mb-0.5 ml-0.5 bg-primary/70 align-middle animate-pulse" aria-hidden="true" />
              )}
            </div>
          )}
        </div>

        {isAssistant && sources.length > 0 && <SourcesPanel sources={sources} />}

        {/* Action row + provenance */}
        {isAssistant && message.status !== 'streaming' && (message.content || message.provider) && (
          <div className="flex items-center gap-3 flex-wrap">
            {message.provider && (
              <p className="text-xs text-muted-foreground">
                via {message.provider}{message.model ? ` (${message.model})` : ''}
                {message.usage?.totalTokens ? ` · ${message.usage.totalTokens.toLocaleString()} tok` : ''}
              </p>
            )}
            {message.content && (
              <button onClick={copyMessage} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" aria-label="Copy message">
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            {onRegenerate && (
              <button onClick={onRegenerate} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" aria-label="Regenerate response">
                <RotateCcw className="h-3 w-3" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.picture} alt={user?.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
    </div>
  )
}

export default ChatMessage
