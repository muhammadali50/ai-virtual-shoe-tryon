"""Webcam capture and live preview utilities."""

from __future__ import annotations

import sys
import time
from typing import Callable, Protocol

import cv2
import numpy as np


class CaptureDevice(Protocol):
    """The subset of OpenCV's capture API used by :class:`Camera`."""

    def isOpened(self) -> bool: ...

    def read(self) -> tuple[bool, np.ndarray | None]: ...

    def set(self, property_id: int, value: float) -> bool: ...

    def release(self) -> None: ...


class CameraError(RuntimeError):
    """Raised when a webcam cannot be opened."""


class Camera:
    """Open a webcam and return mirrored frames with an FPS overlay."""

    def __init__(
        self,
        camera_index: int = 0,
        width: int = 1280,
        height: int = 720,
        capture_factory: Callable[[int], CaptureDevice] | None = None,
    ) -> None:
        """Open ``camera_index`` and request the given frame resolution."""
        factory = capture_factory or cv2.VideoCapture
        try:
            self._capture = factory(camera_index)
        except (cv2.error, OSError) as error:
            message = f"Could not open camera index {camera_index}: {error}"
            raise CameraError(message) from error

        if not self._capture.isOpened():
            self._capture.release()
            raise CameraError(
                f"Could not open camera index {camera_index}. "
                "Check that the camera is connected and available."
            )

        self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self._last_frame_time: float | None = None
        self._fps = 0.0

    @property
    def fps(self) -> float:
        """Return the smoothed approximate capture frame rate."""
        return self._fps

    def read(
        self, mirror: bool = True, overlay: bool = True,
    ) -> np.ndarray | None:
        """Read and mirror the next frame, or return ``None`` on failure."""
        success, frame = self._capture.read()
        if not success or frame is None or frame.size == 0:
            return None

        now = time.perf_counter()
        if self._last_frame_time is not None:
            elapsed = now - self._last_frame_time
            if elapsed > 0:
                measured_fps = 1.0 / elapsed
                self._fps = (
                    measured_fps
                    if self._fps == 0
                    else 0.9 * self._fps + 0.1 * measured_fps
                )
        self._last_frame_time = now

        preview = cv2.flip(frame, 1) if mirror else frame
        if overlay:
            self.draw_fps(preview)
        return preview

    def draw_fps(self, frame: np.ndarray) -> None:
        """Overlay loop FPS, including time spent on inference."""
        cv2.putText(
            frame,
            f"FPS: {self._fps:.1f}",
            (20, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

    def release(self) -> None:
        """Release the underlying webcam resource."""
        self._capture.release()


def run_camera_preview(
    camera_index: int = 0,
    frame_processor: Callable[[np.ndarray], np.ndarray] | None = None,
) -> bool:
    """Preview frames and clean up even if a processor raises an exception.

    A processor receives clean, unmirrored BGR input and returns a display
    frame. It is responsible for mirroring; FPS is drawn after processing.
    """
    camera: Camera | None = None
    window_created = False
    consecutive_failures = 0
    max_consecutive_failures = 30

    try:
        camera = Camera(camera_index=camera_index)
        window_name = "AI Virtual Shoe Try-On - Camera Preview"
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        window_created = True

        while True:
            frame = (camera.read() if frame_processor is None else
                     camera.read(mirror=False, overlay=False))
            if frame is None:
                consecutive_failures += 1
                # waitKey also yields to the GUI loop, avoiding a busy retry loop.
                key = cv2.waitKey(10) & 0xFF
                if key in (ord("q"), ord("Q"), 27):
                    return True
                if consecutive_failures >= max_consecutive_failures:
                    print(
                        "Camera stopped returning frames; ending preview.",
                        file=sys.stderr,
                    )
                    return False
                continue

            consecutive_failures = 0
            if frame_processor is not None:
                frame = frame_processor(frame)
                camera.draw_fps(frame)
            cv2.imshow(window_name, frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                return True
    except CameraError as error:
        print(error, file=sys.stderr)
        return False
    except cv2.error as error:
        print(f"OpenCV preview error: {error}", file=sys.stderr)
        return False
    except KeyboardInterrupt:
        print("Camera preview interrupted.")
        return True
    finally:
        if camera is not None:
            camera.release()
        if window_created:
            cv2.destroyAllWindows()
