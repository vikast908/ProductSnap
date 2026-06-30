import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Check } from 'lucide-react'

/**
 * Button that owns its own idle -> pending -> success/error lifecycle so callers
 * never hand-roll a spinner. Keeps a stable width (no layout shift) by overlaying
 * the spinner on top of the original children.
 *
 * Pass `onClick` returning a Promise. Resolved -> brief success check; rejected -> idle.
 */
export function AsyncButton({ onClick, children, successLabel, disabled, ...props }) {
  const [state, setState] = useState('idle') // idle | pending | success
  const mounted = useRef(true)

  const handleClick = useCallback(async (e) => {
    if (state === 'pending') return
    setState('pending')
    try {
      await onClick?.(e)
      if (mounted.current) {
        setState('success')
        setTimeout(() => mounted.current && setState('idle'), 1200)
      }
    } catch (err) {
      if (mounted.current) setState('idle')
      throw err
    }
  }, [onClick, state])

  return (
    <Button
      {...props}
      disabled={disabled || state === 'pending'}
      onClick={handleClick}
      aria-busy={state === 'pending'}
    >
      <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
        {state === 'pending' && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === 'success' && <Check className="h-4 w-4 text-green-500" />}
        {state === 'success' && successLabel ? successLabel : children}
      </span>
    </Button>
  )
}

export default AsyncButton
