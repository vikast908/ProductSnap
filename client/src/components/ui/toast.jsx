import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { Check, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

let idSeq = 0

/**
 * Global toast + undo bus. Replaces the green banner / native alert() / silent
 * success patterns with one consistent, dismissible, accessible feedback channel.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const toast = useCallback((opts) => {
    const id = ++idSeq
    const duration = opts.duration ?? 4000
    setToasts(prev => [...prev, { id, ...opts }])
    if (duration !== Infinity) {
      timers.current[id] = setTimeout(() => dismiss(id), duration)
    }
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="fixed bottom-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const variant = toast.variant || 'default'
  const Icon = variant === 'success' ? Check : variant === 'error' ? AlertCircle : Info
  const tone =
    variant === 'success' ? 'text-green-500'
    : variant === 'error' ? 'text-destructive'
    : 'text-primary'

  return (
    <div
      role="status"
      className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-card shadow-lg px-4 py-3 flex items-start gap-3 animate-slide-up"
    >
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${tone}`} />
      <div className="flex-1 min-w-0">
        {toast.title && <p className="text-sm font-medium leading-snug">{toast.title}</p>}
        {toast.description && (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{toast.description}</p>
        )}
      </div>
      {toast.action && (
        <button
          onClick={() => { toast.action.onClick(); onDismiss() }}
          className="text-xs font-semibold text-primary hover:underline flex-shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export default ToastProvider
