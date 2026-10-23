# Mobile camera application

React, Vite and TypeScript. Requires Node.js 24 or newer and npm.
Only React and React DOM are runtime dependencies. The Python app is independent.

## Run locally

From the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173 on this computer and press **Start Camera**.
Press **Stop Camera** to release the stream. Permission is requested only after
Start. Stop also cancels a pending request logically: if permission arrives
later, its tracks are immediately stopped. The browser permission dialog
itself cannot be dismissed programmatically.

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
URL can load it. Camera video stays inside that visitor's browser: it is never
recorded, stored, sent through the tunnel, or uploaded by this application.
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
- There is no inference, segmentation, shoe rendering, backend connection,
  analytics, recording or frame upload in this frontend.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Component tests use simulated media devices; they require no webcam. They
cover constraints, error messages, playback failure, disconnects, cleanup,
late permission results and restart races. These checks do not prove mobile
hardware compatibility.

Real-device verification is still required on both Android and iPhone:

1. Allow permission; confirm the rear camera and a live, correctly oriented feed.
2. Rotate portrait/landscape; check aspect ratio, controls and inline playback.
3. Stop/restart; verify the system camera-use indicator turns off after Stop.
4. Deny permission and recover through site settings.
5. Switch apps, lock the phone, navigate away and return; confirm release and restart.
6. Stop while permission is pending; accepting afterward must not leave camera active.

No actual Android/iPhone camera session has been verified during implementation.

References: [getUserMedia security and constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
