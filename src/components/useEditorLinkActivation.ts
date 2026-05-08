import { useEffect, type RefObject } from 'react'
import { normalizeExternalUrl, openExternalUrl } from '../utils/url'
import { parseWikilinkTarget } from '../utils/wikilink'

const CODE_CONTEXT_SELECTOR = '[data-content-type="codeBlock"], pre, code'
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"], [data-content-type="heading"]'

function hasFollowModifier(event: KeyboardEvent | MouseEvent) {
  return event.metaKey || event.ctrlKey
}

function isInsideCodeContext(target: HTMLElement) {
  return !!target.closest(CODE_CONTEXT_SELECTOR)
}

function resolveWikilinkTarget(target: HTMLElement) {
  return target.closest<HTMLElement>('.wikilink[data-target]')?.dataset.target ?? null
}

function resolveAnchorHref(target: HTMLElement) {
  return target.closest<HTMLAnchorElement>('a[href]')?.getAttribute('href')?.trim() ?? null
}

function normalizeHeadingText(value: string) {
  return decodeURIComponent(value)
    .trim()
    .replace(/^#+\s*/u, '')
    .replace(/\s+/gu, ' ')
    .toLowerCase()
}

function slugHeadingText(value: string) {
  return normalizeHeadingText(value)
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/gu, '-')
}

function findHeadingElement(container: HTMLElement, heading: string): HTMLElement | null {
  const normalizedTarget = normalizeHeadingText(heading)
  const slugTarget = slugHeadingText(heading)

  for (const candidate of Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR))) {
    const candidateText = candidate.textContent ?? ''
    if (
      normalizeHeadingText(candidateText) === normalizedTarget
      || slugHeadingText(candidateText) === slugTarget
    ) {
      return candidate
    }
  }

  return null
}

function scrollHeadingIntoView(container: HTMLElement, heading: string): boolean {
  const headingElement = findHeadingElement(container, heading)
  if (!headingElement) return false
  headingElement.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return true
}

function scrollHeadingIntoViewWhenAvailable(container: HTMLElement, heading: string) {
  scrollHeadingIntoView(container, heading)
  const delays = [50, 150, 300, 600, 1200]
  for (const delay of delays) {
    window.setTimeout(() => {
      scrollHeadingIntoView(container, heading)
    }, delay)
  }
}

function blurActiveEditable(container: HTMLElement) {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !container.contains(active)) return
  const editable = active.isContentEditable ? active : active.closest<HTMLElement>('[contenteditable="true"]')
  editable?.blur()
}

function setFollowLinksActive(container: HTMLElement, active: boolean) {
  if (active) container.setAttribute('data-follow-links', '')
  else container.removeAttribute('data-follow-links')
}

function consumeEditorLinkClick(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function activateWikilink(
  event: MouseEvent,
  container: HTMLElement,
  target: string,
  onNavigateWikilink: (target: string) => void,
) {
  consumeEditorLinkClick(event)
  blurActiveEditable(container)

  const { noteTarget, heading } = parseWikilinkTarget(target)
  if (noteTarget) onNavigateWikilink(target)
  if (heading) scrollHeadingIntoViewWhenAvailable(container, heading)
}

function activateExternalUrl(event: MouseEvent, href: string) {
  consumeEditorLinkClick(event)

  if (!hasFollowModifier(event)) return

  const urlTarget = normalizeExternalUrl(href)
  if (!urlTarget) return

  openExternalUrl(urlTarget).catch((err) => console.warn('[link] Failed to open URL:', err))
}

function handleEditorLinkClick(
  event: MouseEvent,
  container: HTMLElement,
  onNavigateWikilink: (target: string) => void,
) {
  if (!(event.target instanceof HTMLElement) || isInsideCodeContext(event.target)) return

  const wikilinkTarget = resolveWikilinkTarget(event.target)
  if (wikilinkTarget) {
    activateWikilink(event, container, wikilinkTarget, onNavigateWikilink)
    return
  }

  const href = resolveAnchorHref(event.target)
  if (href) activateExternalUrl(event, href)
}

export function useEditorLinkActivation(
  containerRef: RefObject<HTMLDivElement | null>,
  onNavigateWikilink: (target: string) => void,
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resetModifierState = () => setFollowLinksActive(container, false)
    const handleModifierChange = (event: KeyboardEvent) => {
      setFollowLinksActive(container, hasFollowModifier(event))
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') resetModifierState()
    }
    const handleClick = (event: MouseEvent) => {
      handleEditorLinkClick(event, container, onNavigateWikilink)
    }

    container.addEventListener('click', handleClick, true)
    window.addEventListener('keydown', handleModifierChange)
    window.addEventListener('keyup', handleModifierChange)
    window.addEventListener('blur', resetModifierState)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      container.removeEventListener('click', handleClick, true)
      window.removeEventListener('keydown', handleModifierChange)
      window.removeEventListener('keyup', handleModifierChange)
      window.removeEventListener('blur', resetModifierState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      resetModifierState()
    }
  }, [containerRef, onNavigateWikilink])
}
