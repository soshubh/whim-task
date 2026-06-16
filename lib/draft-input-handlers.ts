import type * as React from "react"

export function createDraftInputHandlers(options: {
  draft: string
  id: string
  onCancel: () => void
  onSubmit: () => void
  skipBlurRef: React.MutableRefObject<string | null>
}) {
  return {
    onBlur: () => {
      if (options.skipBlurRef.current === options.id) {
        options.skipBlurRef.current = null
        return
      }

      if (options.draft.trim()) {
        options.onSubmit()
        return
      }

      options.onCancel()
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        options.skipBlurRef.current = options.id
        options.onSubmit()
      }

      if (event.key === "Escape") {
        options.onCancel()
      }
    },
  }
}
