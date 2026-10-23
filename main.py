"""Command-line entry point for the foot landmark preview."""

import argparse
from pathlib import Path
import sys

import cv2
import numpy as np

from src.camera import run_camera_preview
from src.foot_tracker import (
    DEFAULT_MODEL_PATH, FootTracker, FootTrackerError, draw_foot_landmarks,
)


def main() -> int:
    """Parse camera options and start the webcam preview."""
    parser = argparse.ArgumentParser(
        description="Show a live webcam preview with foot pose landmarks."
    )
    parser.add_argument(
        "--camera-index",
        "-c",
        type=int,
        default=0,
        help="webcam device index (default: 0)",
    )
    parser.add_argument(
        "--model", type=Path, default=DEFAULT_MODEL_PATH,
        help="path to the Pose Landmarker Lite .task model",
    )
    args = parser.parse_args()
    try:
        with FootTracker(args.model) as tracker:
            def process_frame(frame: np.ndarray) -> np.ndarray:
                result = tracker.process(frame)
                preview = cv2.flip(frame, 1)
                return draw_foot_landmarks(preview, result)

            success = run_camera_preview(args.camera_index, process_frame)
            return 0 if success else 1
    except FootTrackerError as error:
        print(error, file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
