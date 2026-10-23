"""Anatomical foot landmarks from MediaPipe's pretrained pose model."""

from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import time

import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
import numpy as np

DEFAULT_MODEL_PATH = (
    Path(__file__).resolve().parents[1] / "models/pose_landmarker_lite.task"
)
FOOT_INDICES = {"left": (27, 29, 31), "right": (28, 30, 32)}


class FootTrackerError(RuntimeError):
    """Model initialization or inference failed."""


@dataclass(frozen=True)
class FootLandmark:
    """A pixel location in the original image, plus normalized model output.

    Normalized z is relative model depth, not a distance in meters.
    """

    index: int
    x: int
    y: int
    normalized_x: float
    normalized_y: float
    normalized_z: float
    visibility: float
    presence: float


@dataclass(frozen=True)
class FootLandmarks:
    ankle: FootLandmark | None = None
    heel: FootLandmark | None = None
    foot_index: FootLandmark | None = None

    @property
    def points(self) -> tuple[FootLandmark | None, ...]:
        return self.ankle, self.heel, self.foot_index


@dataclass(frozen=True)
class FootTrackingResult:
    left: FootLandmarks
    right: FootLandmarks


def extract_foot_landmarks(
    result: vision.PoseLandmarkerResult,
    width: int,
    height: int,
    threshold: float = 0.5,
) -> FootTrackingResult:
    """Filter missing, uncertain, nonfinite, and off-image predictions."""
    if width <= 0 or height <= 0:
        raise ValueError("Image dimensions must be positive.")
    poses = result.pose_landmarks
    pose = poses[0] if poses else []

    def point(index: int) -> FootLandmark | None:
        if index >= len(pose) or pose[index] is None:
            return None
        value = pose[index]
        values = (
            value.x, value.y, value.z, value.visibility, value.presence
        )
        if any(v is None or not math.isfinite(v) for v in values):
            return None
        if min(value.visibility, value.presence) < threshold:
            return None
        if not (0 <= value.x <= 1 and 0 <= value.y <= 1):
            return None
        return FootLandmark(
            index, min(width - 1, int(value.x * width)),
            min(height - 1, int(value.y * height)),
            value.x, value.y, value.z, value.visibility, value.presence,
        )

    return FootTrackingResult(
        left=FootLandmarks(*(point(i) for i in FOOT_INDICES["left"])),
        right=FootLandmarks(*(point(i) for i in FOOT_INDICES["right"])),
    )


class FootTracker:
    """Own a single CPU Pose Landmarker in synchronous VIDEO mode."""

    def __init__(
        self, model_path: Path = DEFAULT_MODEL_PATH,
        visibility_threshold: float = 0.5,
    ) -> None:
        if not 0 <= visibility_threshold <= 1:
            raise ValueError("Visibility threshold must be between 0 and 1.")
        self.threshold = visibility_threshold
        self._last_timestamp = -1
        self._closed = False
        model_path = Path(model_path)
        if not model_path.is_file():
            raise FootTrackerError(
                f"Model not found: {model_path}. "
                "Follow the model setup instructions in README.md."
            )
        options = vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(
                model_asset_path=str(model_path.resolve()),
                delegate=mp.tasks.BaseOptions.Delegate.CPU,
            ),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            output_segmentation_masks=False,
        )
        try:
            self._model = vision.PoseLandmarker.create_from_options(options)
        except Exception as error:
            raise FootTrackerError(
                f"Could not load Pose Landmarker model: {error}"
            ) from error

    def process(self, frame: np.ndarray) -> FootTrackingResult:
        """Infer on an unmirrored BGR frame; never reuse stale landmarks."""
        if self._closed:
            raise FootTrackerError("The foot tracker is closed.")
        timestamp = max(time.monotonic_ns() // 1_000_000,
                        self._last_timestamp + 1)
        self._last_timestamp = timestamp
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = self._model.detect_for_video(image, timestamp)
        except Exception as error:
            raise FootTrackerError(f"Foot inference failed: {error}") from error
        height, width = frame.shape[:2]
        return extract_foot_landmarks(result, width, height, self.threshold)

    def close(self) -> None:
        """Close the native model once."""
        if not self._closed:
            self._closed = True
            self._model.close()

    def __enter__(self) -> FootTracker:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


def draw_foot_landmarks(
    preview: np.ndarray, result: FootTrackingResult,
    mirrored: bool = True,
) -> np.ndarray:
    """Draw anatomical sides on a preview; inference remains separate."""
    width = preview.shape[1]
    for side, foot, color, row in (
        ("Left", result.left, (0, 255, 0), 65),
        ("Right", result.right, (255, 0, 0), 90),
    ):
        positions = [
            None if point is None else (
                width - 1 - point.x if mirrored else point.x, point.y
            )
            for point in foot.points
        ]
        count = sum(p is not None for p in positions)
        status = ("detected" if count == 3 else
                  f"partial ({count}/3)" if count else "not detected")
        for a, b in ((0, 1), (1, 2), (0, 2)):
            if positions[a] is not None and positions[b] is not None:
                cv2.line(preview, positions[a], positions[b], color, 2)
        for position in positions:
            if position is not None:
                cv2.circle(preview, position, 5, color, -1)
        cv2.putText(preview, f"{side}: {status}", (20, row),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)
    return preview
