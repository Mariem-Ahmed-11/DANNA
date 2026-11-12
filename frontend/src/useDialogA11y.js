import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function visibleFocusable(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0
  )
}

// Keeps keyboard focus inside an open dialog, closes it with Escape, and
// restores focus to the control that opened it.
export function useDialogA11y(isOpen, onClose) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return undefined

    const dialog = dialogRef.current
    if (!dialog) return undefined

    const previouslyFocused = document.activeElement
    const focusFrame = requestAnimationFrame(() => {
      dialog.focus({ preventScroll: true })
    })

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = visibleFocusable(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const focusIsInside = dialog.contains(active) && active !== dialog

      if (event.shiftKey) {
        if (!focusIsInside || active === first) {
          event.preventDefault()
          last.focus({ preventScroll: true })
        }
        return
      }

      if (!focusIsInside || active === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown, true)
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [isOpen])

  return dialogRef
}
