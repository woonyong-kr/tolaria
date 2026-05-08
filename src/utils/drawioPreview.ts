const DRAWIO_PATH_PATTERN = /\.drawio(?:[?#].*)?$/iu

function decodeUrlPath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripUrlDecorators(value: string): string {
  const hashIndex = value.indexOf('#')
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex)
  const queryIndex = withoutHash.indexOf('?')
  return queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex)
}

function normalizePath(path: string): string {
  const absolute = path.startsWith('/')
  const parts: string[] = []

  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop()
      } else if (!absolute) {
        parts.push(part)
      }
      continue
    }
    parts.push(part)
  }

  return `${absolute ? '/' : ''}${parts.join('/')}`
}

function dirname(path: string): string {
  const normalized = path.replace(/\/+$/u, '')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return index === 0 ? '/' : ''
  return normalized.slice(0, index)
}

function joinPath(base: string, relative: string): string {
  if (!base) return normalizePath(relative)
  return normalizePath(`${base.replace(/\/+$/u, '')}/${relative}`)
}

function isExternalUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/iu.test(value)
}

export function isDrawioPath(value: string): boolean {
  return DRAWIO_PATH_PATTERN.test(stripUrlDecorators(value.trim()))
}

export function resolveDrawioLinkPath(options: {
  currentNotePath: string | null | undefined
  href: string
  vaultPath: string | null | undefined
}): string | null {
  const rawHref = options.href.trim()
  if (!rawHref || !isDrawioPath(rawHref) || isExternalUrl(rawHref)) return null

  const href = decodeUrlPath(stripUrlDecorators(rawHref))
  const vaultPath = options.vaultPath?.replace(/\/+$/u, '') ?? ''
  if (href.startsWith('/') && (!vaultPath || href.startsWith(`${vaultPath}/`) || href === vaultPath)) {
    return normalizePath(href)
  }

  if (href.startsWith('/') && vaultPath) {
    return normalizePath(`${vaultPath}${href}`)
  }

  if (vaultPath && !href.startsWith('.') && !href.startsWith('..') && !options.currentNotePath) {
    return joinPath(vaultPath, href)
  }

  const basePath = options.currentNotePath ? dirname(options.currentNotePath) : vaultPath
  return joinPath(basePath, href)
}

export function extractDrawioEmbeddedImage(xml: string): string | null {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) return null

  for (const cell of Array.from(document.querySelectorAll('mxCell[style]'))) {
    const style = cell.getAttribute('style') ?? ''
    const encodedMatch = style.match(/(?:^|;)image=(data:image\/[^;]+%3Bbase64,[^;]+)(?:;|$)/iu)
    if (encodedMatch?.[1]) return encodedMatch[1].replace(/%3B/iu, ';')

    const legacyMatch = style.match(/(?:^|;)image=(data:image\/[^;]+;base64,[^;]+)(?:;|$)/u)
    if (legacyMatch?.[1]) return legacyMatch[1]
  }

  return null
}
