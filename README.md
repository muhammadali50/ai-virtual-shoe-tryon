# AI Virtual Shoe Try-On

## Mobile foot scanning prototype (Step 5)

The independent React/Vite/TypeScript app is in `frontend/`. It provides a
mobile camera preview with rear-camera preference, Start/Stop controls, status,
permission handling and automatic stream cleanup. Scan Foot lets you tap one
visible foot, capture a frame in memory and highlight a MediaPipe MagicTouch
segmentation candidate. This general segmenter does not confirm foot identity.
Camera frames and inference stay in the browser. There is no shoe rendering.

```powershell
cd frontend
npm ci
npm run dev
```

Use Node.js 24 or newer. Open http://localhost:5173 on this computer.
See [frontend setup and HTTPS phone testing](frontend/README.md) for Android,
iPhone, Cloudflare tunnel commands, checks and real-device verification steps.
The existing Python commands and functionality below are independent.

Camera preview with pretrained MediaPipe foot pose landmarks for the
AI-powered real-time virtual shoe try-on project. Python 3.11 is used.

## Setup

From the project root, create and activate a virtual environment. On this
machine, use the installed Python 3.11 executable directly:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe" -m venv .venv
.\.venv\Scripts\Activate.ps1
```

On a machine where Python 3.11 is registered with the Python launcher, the
first command can be `py -3.11 -m venv .venv`.

Install the pinned dependencies:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Verify

Run the environment check:

```powershell
$env:MPLCONFIGDIR = "$PWD\.venv\matplotlib"
python -m unittest discover -s tests -v
Remove-Item Env:MPLCONFIGDIR
```

MediaPipe depends on `opencv-contrib-python`; both OpenCV packages are pinned
to the same version so the requested `opencv-python` package and MediaPipe's
dependency provide a consistent `cv2` module.

## Run the Camera Preview

Complete model setup below, then activate the virtual environment from the
project root and launch the preview:

```powershell
.\.venv\Scripts\Activate.ps1
python main.py
```

Camera index `0` is used by default. To select another camera, pass its index:

```powershell
python main.py --camera-index 1
```

Press **Q** or **Esc** in the preview window to exit. The preview mirrors the
image, requests 1280×720 when supported, and displays the approximate FPS.
FPS includes time spent on inference and rendering between captured frames.

## Pose Landmarker Model Setup

The application uses MediaPipe 0.10.35 Tasks `PoseLandmarker` in VIDEO mode,
with one CPU model instance and strictly increasing millisecond timestamps.
The official Lite float16 version 1 bundle is already downloaded locally to
`models/pose_landmarker_lite.task`. Model binaries are excluded from Git.
On a new checkout, download it once from the project root:

```powershell
New-Item -ItemType Directory -Force models | Out-Null
Invoke-WebRequest -Uri 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' -OutFile 'models/pose_landmarker_lite.task'
Get-FileHash models\pose_landmarker_lite.task -Algorithm SHA256
```

Verified SHA-256:
`59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.
Startup only loads the local file; it never downloads a model. Missing or
invalid files produce an error with exit code 1. An alternative local path
can be specified with `python main.py --model path\to\model.task`.

Source: [Google's Pose Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)
and its [BlazePose GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf).
The MediaPipe software repository uses the
[Apache 2.0 license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
The downloaded bundle contains two TFLite models and no separate license
file; a separate license grant for these exact model weights was not
established from the download itself. These source links record provenance;
the software license is not presented as independent proof of a weights license.

## Foot Landmarks and Limitations

- Anatomical left ankle/heel/foot index: 27/29/31, drawn green.
- Anatomical right ankle/heel/foot index: 28/30/32, drawn blue.
- Inference receives the original BGR camera frame converted to RGB, before
  mirroring or text overlays. Display coordinates are mirrored afterward.
  Labels refer to the person's anatomical sides, not the screen edges.
- Each accepted landmark must have visibility and presence of at least 0.5,
  finite coordinates, and lie inside the image. Missing points are omitted.
  Available points are connected; status reports detected (3/3), partial,
  or not detected. No previous predictions are reused when detection fails.
- Typed results retain original-image pixel coordinates, normalized model
  coordinates, and confidence scores. Normalized depth is not metric distance.
- This is a pretrained whole-body pose model, not precise foot segmentation.
  Only one person is tracked. Close-up feet, occlusion, poor lighting, and
  insufficient body context can cause missing or inaccurate landmarks.
  Try stepping back to show the full body and both feet, improving lighting,
  and keeping ankles and toes in view. Do not treat absent markers as a camera
  failure when the preview itself is visible.
- Custom ML training and improved close-up foot detection belong to a later
  project step. No segmentation or shoe rendering is implemented here.

Verification on this machine: the real model loaded and processed a blank
frame and 12 live camera frames. No foot landmarks passed filtering during
that live sample; successful visual foot detection has not been verified.
MediaPipe emitted native feedback/projection warnings and a failed Clearcut
connection message, but inference and cleanup completed. These messages were
not suppressed or treated as evidence of detection.

### Troubleshooting

- If the camera cannot be opened, check that it is connected and not in use by
  another application, then try another `--camera-index` value.
- On Windows, allow camera access for desktop applications in the system
  privacy settings.
- If the preview window does not appear in a remote or headless session, run
  `python main.py` in a local desktop session with GUI access.

## Run Tests

With the virtual environment active, run:

```powershell
$env:MPLCONFIGDIR = "$PWD\.venv\matplotlib"
python -m unittest discover -s tests -v
Remove-Item Env:MPLCONFIGDIR
```
