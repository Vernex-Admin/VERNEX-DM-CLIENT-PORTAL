import type { DeliverableVersion } from '../types/db'

const FRAME = 'overflow-hidden rounded-card border border-rule bg-surface'

/** Shows one version: an image, a video, a PDF, or a Google Drive embed. */
export function DeliverablePreview({ version, title }: { version: DeliverableVersion | undefined; title: string }) {
  if (!version) {
    return <div className={`${FRAME} p-10 text-center text-ink-muted`}>There is nothing to preview yet.</div>
  }
  switch (version.preview_kind) {
    case 'image':
      return (
        <div className={FRAME}>
          <img src={version.preview_url} alt={`${title}, version ${version.version}`} className="mx-auto max-h-[70dvh] w-full object-contain" />
        </div>
      )
    case 'video':
      return (
        <div className={FRAME}>
          <video controls playsInline preload="metadata" src={version.preview_url} className="max-h-[70dvh] w-full bg-ink">
            Your browser cannot play this video.
          </video>
        </div>
      )
    case 'pdf':
      return (
        <div className={FRAME}>
          <iframe title={`${title}, version ${version.version}`} src={version.preview_url} className="h-[70dvh] w-full" />
        </div>
      )
    case 'drive':
      return (
        <div className={FRAME}>
          <iframe
            title={`${title}, version ${version.version}`}
            src={version.preview_url}
            allow="autoplay"
            className="h-[70dvh] w-full"
          />
        </div>
      )
  }
}
