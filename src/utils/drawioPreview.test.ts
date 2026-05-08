import { describe, expect, it } from 'vitest'
import {
  extractDrawioEmbeddedImage,
  isDrawioPath,
  resolveDrawioLinkPath,
  resolveDrawioPreviewImagePath,
} from './drawioPreview'

describe('isDrawioPath', () => {
  it('recognizes drawio links with query and fragment decorators', () => {
    expect(isDrawioPath('../../assets/diagrams/os-flow.drawio')).toBe(true)
    expect(isDrawioPath('assets/diagrams/os-flow.drawio#page-1')).toBe(true)
    expect(isDrawioPath('assets/diagrams/os-flow.drawio?raw=true')).toBe(true)
  })

  it('rejects non-drawio paths', () => {
    expect(isDrawioPath('assets/diagrams/os-flow.png')).toBe(false)
  })
})

describe('resolveDrawioLinkPath', () => {
  it('resolves relative links from the active note folder', () => {
    expect(resolveDrawioLinkPath({
      currentNotePath: '/Users/woonyong/vault/maps/os/pintos-vm-visual-map.md',
      href: '../../assets/diagrams/os-pintos-vm-overview-flow.drawio',
      vaultPath: '/Users/woonyong/vault',
    })).toBe('/Users/woonyong/vault/assets/diagrams/os-pintos-vm-overview-flow.drawio')
  })

  it('resolves vault-root links that start with a slash', () => {
    expect(resolveDrawioLinkPath({
      currentNotePath: '/vault/maps/os/map.md',
      href: '/assets/diagrams/vm.drawio',
      vaultPath: '/vault',
    })).toBe('/vault/assets/diagrams/vm.drawio')
  })

  it('ignores external urls', () => {
    expect(resolveDrawioLinkPath({
      currentNotePath: '/vault/maps/os/map.md',
      href: 'https://example.com/vm.drawio',
      vaultPath: '/vault',
    })).toBeNull()
  })
})

describe('extractDrawioEmbeddedImage', () => {
  it('extracts encoded embedded preview images from drawio XML', () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell style="shape=image;image=data:image/png%3Bbase64,abc123;" /></root></mxGraphModel></diagram></mxfile>'
    expect(extractDrawioEmbeddedImage(xml)).toBe('data:image/png;base64,abc123')
  })

  it('returns null when no embedded image exists', () => {
    expect(extractDrawioEmbeddedImage('<mxfile><diagram /></mxfile>')).toBeNull()
  })
})

describe('resolveDrawioPreviewImagePath', () => {
  it('maps vault diagram assets to matching preview images', () => {
    expect(resolveDrawioPreviewImagePath(
      '/Users/woonyong/vault/assets/diagrams/os-pintos-vm-page-types-structure.drawio',
    )).toBe('/Users/woonyong/vault/assets/images/os-pintos-vm-page-types-structure-preview.png')
  })

  it('falls back to a sibling preview image outside the vault assets layout', () => {
    expect(resolveDrawioPreviewImagePath('/vault/Attachments/flow.drawio')).toBe('/vault/Attachments/flow-preview.png')
  })
})
