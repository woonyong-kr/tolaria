import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePreview } from './FilePreview'
import type { VaultEntry } from '../types'

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('../lib/telemetry', () => ({
  trackEvent: trackEventMock,
}))

const imageEntry: VaultEntry = {
  path: '/vault/Attachments/photo.png',
  filename: 'photo.png',
  title: 'photo.png',
  isA: null,
  aliases: [],
  belongsTo: [],
  relatedTo: [],
  status: null,
  archived: false,
  modifiedAt: 1700000000,
  createdAt: 1700000000,
  fileSize: 100,
  snippet: '',
  wordCount: 0,
  relationships: {},
  icon: null,
  color: null,
  order: null,
  sidebarLabel: null,
  template: null,
  sort: null,
  view: null,
  visible: null,
  organized: false,
  favorite: false,
  favoriteIndex: null,
  listPropertiesDisplay: [],
  outgoingLinks: [],
  properties: {},
  hasH1: false,
  fileKind: 'binary',
}
const pdfEntry: VaultEntry = {
  ...imageEntry,
  path: '/vault/Attachments/report.pdf',
  filename: 'report.pdf',
  title: 'report.pdf',
}
const drawioEntry: VaultEntry = {
  ...imageEntry,
  path: '/vault/Attachments/flow.drawio',
  filename: 'flow.drawio',
  title: 'flow.drawio',
}
const secondDrawioEntry: VaultEntry = {
  ...drawioEntry,
  path: '/vault/Attachments/second-flow.drawio',
  filename: 'second-flow.drawio',
  title: 'second-flow.drawio',
}
const vaultAssetDrawioEntry: VaultEntry = {
  ...drawioEntry,
  path: '/vault/assets/diagrams/os-pintos-vm-page-types-structure.drawio',
  filename: 'os-pintos-vm-page-types-structure.drawio',
  title: 'os-pintos-vm-page-types-structure.drawio',
}

function makeDrawioFixture(imageSrc: string): string {
  return `
    <mxfile host="65bd71144e">
      <diagram id="original-reference" name="원본 이미지 기준">
        <mxGraphModel page="1" pageWidth="1697" pageHeight="2063" background="#ffffff">
          <root>
            <mxCell id="0" />
            <mxCell id="1" parent="0" />
            <mxCell
              id="title"
              value="os pintos process fork sequence"
              style="text;html=1;strokeColor=none;fillColor=none;"
              parent="1"
              vertex="1"
            />
            <mxCell
              id="exact-image"
              value=""
              style="shape=image;html=1;aspect=fixed;imageAspect=1;locked=1;image=${imageSrc};rounded=0;"
              parent="1"
              vertex="1"
            />
          </root>
        </mxGraphModel>
      </diagram>
    </mxfile>
  `
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('FilePreview', () => {
  beforeEach(() => {
    trackEventMock.mockClear()
    vi.unstubAllGlobals()
  })

  it('routes header file actions to the active file path', () => {
    const onRevealFile = vi.fn()
    const onCopyFilePath = vi.fn()
    const onOpenExternalFile = vi.fn()

    render(
      <FilePreview
        entry={imageEntry}
        onRevealFile={onRevealFile}
        onCopyFilePath={onCopyFilePath}
        onOpenExternalFile={onOpenExternalFile}
      />,
    )

    expect(trackEventMock).toHaveBeenCalledWith('file_preview_opened', { preview_kind: 'image' })

    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onRevealFile).toHaveBeenCalledWith('/vault/Attachments/photo.png')
    expect(onCopyFilePath).toHaveBeenCalledWith('/vault/Attachments/photo.png')
    expect(onOpenExternalFile).toHaveBeenCalledWith('/vault/Attachments/photo.png')
    expect(trackEventMock).toHaveBeenCalledWith('file_preview_action', {
      action: 'reveal',
      preview_kind: 'image',
    })
    expect(trackEventMock).toHaveBeenCalledWith('file_preview_action', {
      action: 'copy_path',
      preview_kind: 'image',
    })
    expect(trackEventMock).toHaveBeenCalledWith('file_preview_action', {
      action: 'open_external',
      preview_kind: 'image',
    })
  })

  it('renders supported PDF files through the asset preview path', () => {
    render(<FilePreview entry={pdfEntry} />)

    expect(screen.getByTestId('pdf-file-preview')).toHaveAttribute('data', 'asset:///vault/Attachments/report.pdf')
    expect(screen.getByText('PDF file')).toBeInTheDocument()
  })

  it('renders supported PDFs when binary metadata is unavailable', () => {
    render(<FilePreview entry={{ ...pdfEntry, fileKind: undefined }} />)

    expect(screen.getByTestId('pdf-file-preview')).toHaveAttribute('data', 'asset:///vault/Attachments/report.pdf')
  })

  it('renders draw.io files with an embedded preview image', async () => {
    const encodedImageSrc = 'data:image/png%3Bbase64,abc123'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => makeDrawioFixture(encodedImageSrc),
    })))

    render(<FilePreview entry={drawioEntry} />)

    expect(await screen.findByTestId('drawio-file-preview')).toHaveAttribute('src', 'data:image/png;base64,abc123')
    expect(screen.getByText('DRAWIO file')).toBeInTheDocument()
    expect(trackEventMock).toHaveBeenCalledWith('file_preview_opened', { preview_kind: 'drawio' })
  })

  it('keeps a loading state until the draw.io asset fetch resolves', async () => {
    const pendingResponse = deferred<{ ok: boolean; text: () => Promise<string> }>()
    vi.stubGlobal('fetch', vi.fn(() => pendingResponse.promise))

    render(<FilePreview entry={drawioEntry} />)

    expect(screen.getByTestId('drawio-file-preview-loading')).toHaveTextContent('Loading draw.io preview')

    pendingResponse.resolve({
      ok: true,
      text: async () => makeDrawioFixture('data:image/png%3Bbase64,ready'),
    })

    expect(await screen.findByTestId('drawio-file-preview')).toHaveAttribute('src', 'data:image/png;base64,ready')
    expect(screen.queryByTestId('drawio-file-preview-loading')).not.toBeInTheDocument()
  })

  it('ignores a stale draw.io fetch result after switching to another file', async () => {
    const firstResponse = deferred<{ ok: boolean; text: () => Promise<string> }>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => makeDrawioFixture('data:image/png%3Bbase64,current'),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<FilePreview entry={drawioEntry} />)

    rerender(<FilePreview entry={secondDrawioEntry} />)
    firstResponse.resolve({
      ok: true,
      text: async () => makeDrawioFixture('data:image/png%3Bbase64,stale'),
    })

    expect(await screen.findByTestId('drawio-file-preview')).toHaveAttribute('src', 'data:image/png;base64,current')
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'asset:///vault/Attachments/flow.drawio')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'asset:///vault/Attachments/second-flow.drawio')
  })

  it('uses the matching assets image when a draw.io file has no embedded preview image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '<mxfile><diagram /></mxfile>',
    })))

    render(<FilePreview entry={vaultAssetDrawioEntry} />)

    expect(await screen.findByTestId('drawio-file-preview')).toHaveAttribute(
      'src',
      'asset:///vault/assets/images/os-pintos-vm-page-types-structure-preview.png',
    )
    expect(trackEventMock).not.toHaveBeenCalledWith('file_preview_failed', { preview_kind: 'drawio' })
  })

  it('falls back when the generated draw.io preview image cannot render', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '<mxfile><diagram /></mxfile>',
    })))

    render(<FilePreview entry={vaultAssetDrawioEntry} />)

    fireEvent.error(await screen.findByTestId('drawio-file-preview'))

    expect(await screen.findByTestId('file-preview-fallback')).toHaveTextContent('draw.io preview failed')
    expect(trackEventMock).toHaveBeenCalledWith('file_preview_failed', { preview_kind: 'drawio' })
  })

  it('falls back when a draw.io asset request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
    })))

    render(<FilePreview entry={drawioEntry} />)

    expect(await screen.findByTestId('file-preview-fallback')).toHaveTextContent('draw.io preview failed')
    expect(trackEventMock).toHaveBeenCalledWith('file_preview_failed', { preview_kind: 'drawio' })
  })

  it('provides a graceful fallback when a PDF preview cannot render', () => {
    render(<FilePreview entry={pdfEntry} />)

    expect(screen.getByTestId('file-preview-fallback')).toHaveTextContent('PDF preview failed')
    expect(screen.getByRole('button', { name: 'Open in default app' })).toBeInTheDocument()
  })

  it('tracks image preview failures without leaking the file path', () => {
    render(<FilePreview entry={imageEntry} />)

    fireEvent.error(screen.getByTestId('image-file-preview'))

    expect(trackEventMock).toHaveBeenCalledWith('file_preview_failed', { preview_kind: 'image' })
    expect(trackEventMock).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ path: expect.any(String) }),
    )
  })

  it('does not fetch asset text for existing image and PDF previews', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<FilePreview entry={imageEntry} />)
    expect(screen.getByTestId('image-file-preview')).toHaveAttribute('src', 'asset:///vault/Attachments/photo.png')

    rerender(<FilePreview entry={pdfEntry} />)
    expect(screen.getByTestId('pdf-file-preview')).toHaveAttribute('data', 'asset:///vault/Attachments/report.pdf')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
