import { useCamera } from '../hooks/useCamera'
import { useFootScan } from '../hooks/useFootScan'
import FootSelection from './FootSelection'

const statusLabels = {
  idle: 'Camera off', requesting: 'Waiting for camera',
  active: 'Camera live', error: 'Camera unavailable',
}

export default function CameraPreview() {
  const { videoRef, status, error, start, stop } = useCamera()
  const busy = status === 'requesting'
  const active = status === 'active'
  const { canvasRef, frozen, phase, message, warnings, retry, select } = useFootScan(videoRef, active)

  return (
    <section className="camera-card" aria-label="Camera studio">
      <div className="camera-toolbar">
        <span className="panel-label">LIVE PREVIEW</span>
        <span className={`status status-${status}`} role="status">
          <span className="status-dot" aria-hidden="true" />{statusLabels[status]}
        </span>
      </div>
      <div className={`viewfinder ${active ? 'is-live' : ''}`}>
        <video ref={videoRef} autoPlay playsInline muted
          aria-label="Live camera preview" />
        <canvas ref={canvasRef} className="scan-snapshot" hidden={!active || !frozen}
          aria-label="Captured image with segmentation candidate, if available" role="img" />
        {active && phase === 'selecting' && (
          <FootSelection onSelect={(point) => void select(point)} />
        )}
        {!active && (
          <div className="camera-empty">
            <div className="camera-glyph" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none"><path d="M8 15h8l3-5h10l3 5h8v23H8V15Z" /><circle cx="24" cy="26" r="7" /></svg>
            </div>
            <h2>{busy ? 'One moment…' : 'Your perspective starts here'}</h2>
            <p>{busy ? 'Allow camera access when your browser asks.' : 'Turn on your camera to see a live preview.'}</p>
            <span className="viewfinder-note">REAR CAMERA PREFERRED</span>
          </div>
        )}
        <span className="frame-corner top-left" aria-hidden="true" />
        <span className="frame-corner bottom-right" aria-hidden="true" />
      </div>
      <div className="camera-controls">
        <div className="scan-controls">
          <div className="button-row">
            <button className="scan-button" disabled={!active || phase !== 'idle'} onClick={retry}>Scan Foot</button>
            <button className="stop-button" disabled={!active || phase === 'idle'} onClick={retry}>Retry</button>
          </div>
          <p className="scan-status" role={phase === 'error' ? 'alert' : 'status'}>
            {active ? message || 'Keep one whole foot in view, then choose Scan Foot.' : 'Start the camera to scan.'}
          </p>
          {warnings.map((warning) => <p className="scan-warning" key={warning}>{warning}</p>)}
          <p className="candidate-note">Experimental segmentation candidate, not verified foot detection. If no foot is visible or the highlight covers background, Retry and reposition.</p>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="button-row">
          <button className="start-button" onClick={() => void start()} disabled={busy || active}>
            <span aria-hidden="true">↗</span> {busy ? 'Starting…' : 'Start Camera'}
          </button>
          <button className="stop-button" onClick={stop} disabled={!busy && !active}>
            <span className="stop-icon" aria-hidden="true" /> Stop Camera
          </button>
        </div>
        <p className="privacy-note"><span aria-hidden="true">◇</span> Snapshots stay in memory on your device. Camera images are never uploaded.</p>
      </div>
    </section>
  )
}
