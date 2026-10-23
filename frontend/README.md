# Mobile foot scanning prototype

React, Vite and TypeScript. Requires Node.js 24 or newer and npm.
React, React DOM and the pinned `@mediapipe/tasks-vision` 1.1.1 are runtime
dependencies. The Python app is independent and unchanged.

## Run locally

From the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173 on this computer and press **Start Camera**.
`predev` and `prebuild` prepare the real model and matching WASM assets. The first
run requires internet access to Google's model storage; later runs reuse the
checksum-verified local file. Generated assets are excluded from Git but copied
into `dist/` by Vite, so deployment builds also prepare them automatically.
Press **Stop Camera** to release the stream. Permission is requested only after
Start. Stop also cancels a pending request logically: if permission arrives
later, its tracks are immediately stopped. The browser permission dialog
itself cannot be dismissed programmatically.

## Scan one foot

1. Start the rear camera and fit one entire bare foot in the image with good
   lighting and a contrasting background.
2. Tap **Scan Foot**, then **tap inside the visible foot**. Tapping empty
   letterboxing is ignored. Hold still until the frame freezes. With a keyboard,
   focus the image, use arrow keys to position the crosshair, then press Enter.
   That crosshair is only your selection cursor, not a detected region.
3. The exact tapped frame is captured in memory, reduced to at most 768 pixels
   along its longest side, and processed locally. The first scan loads about
   30.5 MB of model weights plus the WASM runtime; allow time on mobile networks.
4. **Segmentation Preview** shows the frozen frame and a translucent green
   **segmentation candidate**. Only actual model mask pixels at or above 0.5
   are colored. This is a foreground membership threshold, not a foot score.
5. Use **Retry** to discard the image and tap again. Retry also cancels a pending
   worker scan. **Stop Camera**, switching apps/tabs, or leaving the page frees
   camera and model resources. Returning requires Start Camera again.

The model cannot determine whether a foot is present. If no foot is visible,
it can select another object or background. Inspect every result yourself.
Empty masks, selection over 80% of the frame, and masks reaching an image edge
show advice; those checks describe geometry, not foot identity or validity.
A partially visible foot may produce a partial candidate, including cases the
edge check misses. Nothing reconstructs the missing part.

## Model and inference architecture

- Uses Google's pretrained **MagicTouch v2 int8** interactive segmentation
  task bundle. It supports point-guided general object segmentation, useful
  for this initial close-up selection experiment without whole-body landmarks.
- Verified API: `InteractiveSegmenter.setImage(image)` followed by
  `segment([{ brushMode: 1, point: [{ x, y }], isCompleted: true }])` returning
  a single confidence mask. Runtime 1.1.1 omits the declared `BrushMode` runtime
  export; the adapter uses the documented `POSITIVE = 1` with a type-only import.
- `src/segmentation/engine.ts` isolates the model API for a future custom model.
  It copies output values before closing each native mask.
- `client.ts` lazily starts a module Web Worker, transfers image pixels, reuses
  one CPU model across scans, allows only one pending request and terminates
  a worker after a 90-second timeout. No continuous camera inference runs.
  Without Worker/OffscreenCanvas, a lazy main-thread engine processes one bounded
  snapshot after a UI paint. That fallback can pause the UI during synchronous
  inference and cannot be interrupted mid-call.
- `geometry.ts` maps viewport taps through centered `contain`/`cover` scaling,
  accounting for image offsets and cropping. The application uses `contain`,
  browser-oriented intrinsic video dimensions, no CSS rotation, no mirroring.
  Snapshot and mask are composited on one canvas, then displayed with `contain`;
  rotating the phone afterwards cannot separate the mask from its image.
- Model and runtime are served from this site's `segmentation/` directory.
  No frames, tap coordinates or masks are sent to a backend. No analytics,
  frame storage, recording, shoe overlays or custom training are added.
- Limited-memory devices may fail initialization or inference; errors suggest
  closing other tabs and retrying. The browser/OS may kill a tab before JavaScript
  can show an error. Actual memory use exceeds the compressed/download size.

Model provenance: [official interactive segmenter guide](https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter/web_js),
[model overview](https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter),
[official bundle](https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task).
Downloaded bundle size: 30,525,312 bytes. SHA-256:
`38431bc66b883404e8397f74c3579404315b9b52b04a46c6346fe906a7309b03`.
The setup script pins the checksum even though Google's URL uses `latest`.
If the upstream file changes, setup fails rather than silently changing models;
review compatibility and update the checksum deliberately.

## Test the updated Vercel website

The existing deployment must be rebuilt with these changes before it has Scan
Foot. Use the existing project's Git deployment workflow, with Root Directory
`frontend`, Install Command `npm ci`, Build Command `npm run build`, and Output
Directory `dist`. The build must be able to download the model from Google.
No server environment variables or Python backend are needed.

Open the resulting HTTPS deployment URL directly in Android Chrome or iPhone
Safari. Allow camera access and follow **Scan one foot** above. If the old UI
appears, confirm the deployed commit and reload. If initialization fails, check
that `/segmentation/interactive_segmentation.task` and `/segmentation/wasm/`
assets were included in the build and return real binary/JS files rather than
an HTML fallback. This implementation does not itself publish a deployment.

## Test on an Android phone or iPhone over HTTPS

HTTP LAN URLs such as `http://192.168.x.x:5173` are generally not secure contexts
and cannot reliably use `getUserMedia`. Use a trusted HTTPS URL instead of
bypassing browser security or accepting an untrusted self-signed certificate.

Install the official [Cloudflare connector](https://developers.cloudflare.com/tunnel/downloads/)
once. On Windows:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Open new terminals after installation so PATH is updated. In terminal 1,
from `frontend/`:

```powershell
npm run build
npm run preview
```

In terminal 2, also from `frontend/`:

```powershell
npm run tunnel
```

This runs `cloudflared tunnel --url http://127.0.0.1:4173 --http-host-header localhost`.
The host-header override allows Vite's normal localhost host validation;
no wildcard host allowlist is needed. Preview uses a fixed port and fails if
4173 is busy so the tunnel cannot silently point to the wrong port.

Copy the **HTTPS** `https://…trycloudflare.com` URL printed by cloudflared.
Open it directly in **Chrome on Android** or **Safari on iPhone**, then tap
Start Camera and allow camera access. Avoid embedded browsers inside messaging
apps. The phone needs internet access; it need not be on the same Wi-Fi.
Keep both terminals running. Ctrl+C stops each process; tunnel URLs are
temporary and change on restart. Rebuild after edits when testing preview.

This serves only the frontend production build. Anyone with the temporary
URL can load it. Camera images and masks stay in memory inside that visitor's
browser; this application never sends them through the tunnel or uploads them.
Quick Tunnels are for development, not production hosting.

If the tunnel fails, verify `http://localhost:4173` first, check that
`cloudflared --version` works in the new terminal, and check local network
restrictions. An existing cloudflared `config.yaml` can interfere with Quick
Tunnels; follow the [official troubleshooting notes](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Camera behavior and reusable code

- `src/hooks/useCamera.ts` owns the stream, error mapping and lifecycle. Its
  `videoRef` gives future code access to the native video element.
- `src/components/CameraPreview.tsx` contains the reusable camera UI.
- Rear camera is preferred through `facingMode: { ideal: 'environment' }`.
  Browsers may choose another available camera. Width/height are preferences,
  not requirements. No microphone is requested.
- `playsInline`, muted playback and `object-fit: contain` preserve the full
  browser-oriented frame without cropping, stretching, or forced mirroring.
  Rotation follows browser video orientation; letterboxing is expected.
- Stop, unmount, pagehide and hiding the tab release all tracks. Return to
  the page and tap Start again. Disconnects and playback failures show an error.
- Permission denial, missing/busy cameras, unsupported browsers and insecure
  pages have actionable messages. Reset denied permissions in browser/site
  settings and confirm OS camera permission if a retry still fails.
- `src/hooks/useFootScan.ts` owns capture, candidate rendering and cancellation.
  It reuses the existing camera hook's video element without modifying that hook.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Component tests use simulated media devices and segmentation clients. Unit
tests cover coordinate mapping, mask thresholding, geometric warnings, model
transport, reuse, timeout and fallback. Component tests cover capture, retry,
late results, cancellation and errors, plus the existing camera tests.
These checks do not prove mobile hardware compatibility or foot accuracy.

For the actual model integration check, run `npm run test:model`, open
`http://localhost:4174/tests/model-smoke.html`, and press **Run model check**.
It runs the real model twice on a synthetic fixture with different prompts,
checks dimensions/finite mask values and nontrivial prompt-dependent results,
and disposes the client. The fixture is test input, not a simulated model result.
This builds a separate test bundle using production bundling and serves it
locally until Ctrl+C. The test page is not included in the normal production
`dist/` build.

Real-device verification is still required on both Android and iPhone:

1. Allow permission; confirm the rear camera and a live, correctly oriented feed.
2. Rotate portrait/landscape; check aspect ratio, controls and inline playback.
3. Stop/restart; verify the system camera-use indicator turns off after Stop.
4. Deny permission and recover through site settings.
5. Switch apps, lock the phone, navigate away and return; confirm release and restart.
6. Stop while permission is pending; accepting afterward must not leave camera active.

For Step 5 also check mask alignment after rotation, taps near image borders,
background taps, no foot, cropped feet, poor lighting, Retry during loading,
offline first load, and a device with limited memory. Verify that background
selection is never presented as confirmed foot detection.

The project owner reports that the previous mobile camera deployment works.
Real-device **segmentation** has not been verified during this implementation.

Verified locally on 2026-10-23: TypeScript, ESLint, production build, 42 frontend
tests, 19 existing Python tests, and Python dependency checks passed. The real
MagicTouch model passed the browser smoke test in development and in the
production-bundled worker: two prompts selected 16,101 and 74,836 pixels from
the same 320×240 synthetic fixture. This confirms runtime/model integration,
not foot identification or accuracy. Python source, tests, requirements and
the existing camera hook have no changes.
MediaPipe emitted native WebGL/feedback-tensor warnings during the development
smoke run; inference still returned valid masks. The separate smoke-build
directory is excluded from Vite's file watcher to avoid watching large generated
model files while the development server is also running.

References: [getUserMedia security and constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
