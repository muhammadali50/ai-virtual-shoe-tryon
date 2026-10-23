import CameraPreview from './components/CameraPreview'

export default function App() {
  return (
    <main className="app-shell">
      <header className="page-header">
        <a className="wordmark" href="./" aria-label="AI Virtual Shoe Try-On home">
          <span className="brand-mark" aria-hidden="true">↗</span> STEP / INTO
        </a>
        <span className="edition">FOOT SCAN · PROTOTYPE</span>
      </header>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">A NEW POINT OF VIEW</p>
        <h1 id="page-title">AI Virtual<br /><span>Shoe Try-On</span></h1>
        <p className="intro-copy">Frame one foot. Tap to select it.<br className="desktop-break" /> Explore a segmentation candidate, on your device.</p>
      </section>
      <CameraPreview />
      <footer className="page-footer">
        <span>YOUR CAMERA. YOUR SPACE.</span>
        <span>Made for a closer look.</span>
      </footer>
    </main>
  )
}
