import { useEffect } from 'react'

const enhanceScrollableTables = (root: ParentNode) => {
  root.querySelectorAll<HTMLElement>('.ant-table-content').forEach((element) => {
    if (!element.hasAttribute('tabindex')) element.tabIndex = 0
    if (!element.hasAttribute('aria-label')) element.setAttribute('aria-label', 'Scrollable data table')
  })
}

export function AccessibilityEnhancer() {
  useEffect(() => {
    enhanceScrollableTables(document)
    let pendingScan: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (pendingScan) return
      pendingScan = setTimeout(() => {
        pendingScan = null
        enhanceScrollableTables(document)
      }, 0)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (pendingScan) clearTimeout(pendingScan)
    }
  }, [])

  return null
}
