import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '../mock-tauri'

const ASSET_URL_PREFIX = 'asset://localhost/'
const HTTP_ASSET_URL_PREFIX = 'http://asset.localhost/'
const ASSET_URL_PREFIXES = [ASSET_URL_PREFIX, HTTP_ASSET_URL_PREFIX]
const ATTACHMENTS_SEGMENT = '/attachments/'
const RELATIVE_ATTACHMENTS_PREFIX = 'attachments/'
const RELATIVE_ASSETS_PREFIX = 'assets/'
const VAULT_ROOT_RELATIVE_PREFIXES = [RELATIVE_ATTACHMENTS_PREFIX, RELATIVE_ASSETS_PREFIX]
const WINDOWS_EXTENDED_PATH_PREFIX = '\\\\?\\'
const WINDOWS_EXTENDED_UNC_PREFIX = '\\\\?\\UNC\\'
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/

type Markdown = string
type VaultPath = string
type AttachmentPath = string
type AbsolutePath = string
type MarkdownImageUrl = string
type BasePath = string

// Matches markdown image syntax: ![alt](url) or ![alt](url "title").
const MD_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s"]+)(\s+"[^"]*")?\)/g

function assetUrl(path: AbsolutePath): MarkdownImageUrl {
  return convertFileSrc(path)
}

function usesWindowsSeparators(path: string): boolean {
  return WINDOWS_DRIVE_PATH_PATTERN.test(path) || path.startsWith('\\\\')
}

function relativePathForVault(vaultPath: VaultPath, attachmentPath: AttachmentPath): AttachmentPath {
  return usesWindowsSeparators(vaultPath)
    ? attachmentPath.replace(/\//g, '\\')
    : attachmentPath.replace(/\\/g, '/')
}

function vaultLocalAssetPath(vaultPath: VaultPath, attachmentPath: AttachmentPath): AbsolutePath {
  const separator = usesWindowsSeparators(vaultPath) ? '\\' : '/'
  const normalizedAttachmentPath = relativePathForVault(vaultPath, attachmentPath)
  const joiner = vaultPath.endsWith('/') || vaultPath.endsWith('\\') ? '' : separator
  return `${vaultPath}${joiner}${normalizedAttachmentPath}`
}

function removeWindowsExtendedPrefix(path: AbsolutePath): AbsolutePath {
  if (path.startsWith(WINDOWS_EXTENDED_UNC_PREFIX)) {
    return `\\\\${path.slice(WINDOWS_EXTENDED_UNC_PREFIX.length)}`
  }
  if (path.startsWith(WINDOWS_EXTENDED_PATH_PREFIX)) {
    return path.slice(WINDOWS_EXTENDED_PATH_PREFIX.length)
  }
  return path
}

function normalizedFilesystemPath(path: AbsolutePath): AbsolutePath {
  return removeWindowsExtendedPrefix(path).replace(/\\/g, '/')
}

function withoutTrailingSlash(path: AbsolutePath): AbsolutePath {
  return path.replace(/\/+$/, '')
}

function extractAttachmentPath(absolutePath: AbsolutePath): AttachmentPath | null {
  const normalizedPath = normalizedFilesystemPath(absolutePath)
  const index = normalizedPath.lastIndexOf(ATTACHMENTS_SEGMENT)
  if (index === -1) return null

  const filename = normalizedPath.slice(index + ATTACHMENTS_SEGMENT.length)
  return filename ? `${RELATIVE_ATTACHMENTS_PREFIX}${filename}` : null
}

function assetUrlPrefix(url: MarkdownImageUrl): string | null {
  return ASSET_URL_PREFIXES.find(prefix => url.startsWith(prefix)) ?? null
}

function decodeAssetPath(url: MarkdownImageUrl): AbsolutePath {
  const prefix = assetUrlPrefix(url)
  return prefix ? decodeURIComponent(url.slice(prefix.length)) : ''
}

function isAssetUrl(url: MarkdownImageUrl): boolean {
  return assetUrlPrefix(url) !== null
}

function isCurrentVaultAsset(url: MarkdownImageUrl, vaultPath: VaultPath): boolean {
  const absolutePath = withoutTrailingSlash(normalizedFilesystemPath(decodeAssetPath(url)))
  const normalizedVaultPath = withoutTrailingSlash(normalizedFilesystemPath(vaultPath))
  return absolutePath === normalizedVaultPath || absolutePath.startsWith(`${normalizedVaultPath}/`)
}

function currentVaultAttachmentPath(url: MarkdownImageUrl, vaultPath: VaultPath): AttachmentPath | null {
  const absolutePath = normalizedFilesystemPath(decodeAssetPath(url))
  const normalizedVaultPath = withoutTrailingSlash(normalizedFilesystemPath(vaultPath))

  for (const relativePrefix of VAULT_ROOT_RELATIVE_PREFIXES) {
    const localAssetPrefix = `${normalizedVaultPath}/${relativePrefix}`
    if (!absolutePath.startsWith(localAssetPrefix)) continue

    const filename = absolutePath.slice(localAssetPrefix.length)
    return filename ? `${relativePrefix}${filename}` : null
  }

  return null
}

function isVaultRootRelativeAssetPath(url: MarkdownImageUrl): boolean {
  return VAULT_ROOT_RELATIVE_PREFIXES.some(prefix => url.startsWith(prefix))
}

function isDocumentRelativeAssetPath(url: MarkdownImageUrl): boolean {
  return url.startsWith('./') || url.startsWith('../')
}

function stripUrlSuffix(url: MarkdownImageUrl): { path: string; suffix: string } {
  const suffixIndex = url.search(/[?#]/)
  if (suffixIndex === -1) return { path: url, suffix: '' }
  return { path: url.slice(0, suffixIndex), suffix: url.slice(suffixIndex) }
}

function normalizePosixPath(path: string): string {
  const isAbsolute = path.startsWith('/')
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return ''
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `${isAbsolute ? '/' : ''}${segments.join('/')}`
}

function isInsideVault(path: AbsolutePath, vaultPath: VaultPath): boolean {
  const normalizedPath = withoutTrailingSlash(normalizedFilesystemPath(path))
  const normalizedVaultPath = withoutTrailingSlash(normalizedFilesystemPath(vaultPath))
  return normalizedPath === normalizedVaultPath || normalizedPath.startsWith(`${normalizedVaultPath}/`)
}

function resolveDocumentRelativeAssetPath(
  vaultPath: VaultPath,
  basePath: BasePath | undefined,
  url: MarkdownImageUrl,
): AbsolutePath | null {
  if (!basePath || !isDocumentRelativeAssetPath(url) || usesWindowsSeparators(vaultPath)) return null

  const { path, suffix } = stripUrlSuffix(url)
  const normalizedVaultPath = withoutTrailingSlash(normalizedFilesystemPath(vaultPath))
  const normalizedBasePath = normalizedFilesystemPath(basePath)
  const absoluteBasePath = normalizedBasePath.startsWith('/')
    ? normalizedBasePath
    : `${normalizedVaultPath}/${normalizedBasePath.replace(/^\/+/, '')}`
  const baseDirectory = absoluteBasePath.endsWith('/')
    ? withoutTrailingSlash(absoluteBasePath)
    : absoluteBasePath.split('/').slice(0, -1).join('/')
  const resolvedPath = normalizePosixPath(`${baseDirectory}/${path}`)

  if (!resolvedPath || !isInsideVault(resolvedPath, vaultPath)) return null
  return `${resolvedPath}${suffix}`
}

function rewriteMarkdownImages(
  markdown: Markdown,
  transformUrl: (url: MarkdownImageUrl) => MarkdownImageUrl | null,
): Markdown {
  return markdown.replace(MD_IMAGE_PATTERN, (match, alt, url, title = '') => {
    const nextUrl = transformUrl(url)
    return nextUrl ? `![${alt}](${nextUrl}${title})` : match
  })
}

export function resolveImageUrls(markdown: Markdown, vaultPath: VaultPath, basePath?: BasePath): Markdown {
  if (!isTauri() || !vaultPath) return markdown

  return rewriteMarkdownImages(markdown, (url) => {
    if (isVaultRootRelativeAssetPath(url)) {
      return assetUrl(vaultLocalAssetPath(vaultPath, url))
    }

    const documentRelativePath = resolveDocumentRelativeAssetPath(vaultPath, basePath, url)
    if (documentRelativePath) {
      return assetUrl(documentRelativePath)
    }

    if (!isAssetUrl(url) || isCurrentVaultAsset(url, vaultPath)) {
      return null
    }

    const attachmentPath = extractAttachmentPath(decodeAssetPath(url))
    return attachmentPath ? assetUrl(vaultLocalAssetPath(vaultPath, attachmentPath)) : null
  })
}

export function portableImageUrls(markdown: Markdown, vaultPath: VaultPath): Markdown {
  if (!vaultPath) return markdown

  return rewriteMarkdownImages(markdown, (url) => {
    if (!isAssetUrl(url)) return null

    return currentVaultAttachmentPath(url, vaultPath)
  })
}
