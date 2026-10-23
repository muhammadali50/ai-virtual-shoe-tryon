"""Synthetic model tests; no webcam or downloaded model is required."""

from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

from src.camera import run_camera_preview
from src.foot_tracker import (
    FootTracker, FootTrackerError, draw_foot_landmarks,
    extract_foot_landmarks,
)


def landmark(**changes):
    values = dict(x=0.25, y=0.75, z=-0.1, visibility=0.9, presence=0.9)
    values.update(changes)
    return SimpleNamespace(**values)


def pose_result(points=None):
    return SimpleNamespace(
        pose_landmarks=[points if points is not None else
                        [landmark() for _ in range(33)]]
    )


class ExtractionTest(unittest.TestCase):
    def test_indices_and_pixel_coordinates(self):
        result = extract_foot_landmarks(pose_result(), 640, 480)
        self.assertEqual([p.index for p in result.left.points], [27, 29, 31])
        self.assertEqual([p.index for p in result.right.points], [28, 30, 32])
        self.assertEqual((result.left.ankle.x, result.left.ankle.y), (160, 360))

    def test_visibility_presence_and_partial_feet(self):
        pose = [landmark() for _ in range(33)]
        pose[27] = landmark(visibility=0.49)
        pose[29] = landmark(presence=0.1)
        result = extract_foot_landmarks(pose_result(pose), 640, 480)
        self.assertIsNone(result.left.ankle)
        self.assertIsNone(result.left.heel)
        self.assertIsNotNone(result.left.foot_index)
        self.assertTrue(all(result.right.points))

    def test_missing_landmarks(self):
        result = extract_foot_landmarks(pose_result([None] * 28), 640, 480)
        self.assertEqual(result.left.points, (None, None, None))
        self.assertEqual(result.right.points, (None, None, None))

    def test_empty_result(self):
        result = extract_foot_landmarks(
            SimpleNamespace(pose_landmarks=[]), 640, 480
        )
        self.assertFalse(any(result.left.points + result.right.points))

    def test_out_of_bounds_nonfinite_and_missing_confidence(self):
        for change in ({"x": -0.1}, {"y": 1.2}, {"z": float("nan")},
                       {"visibility": None}, {"presence": None}):
            with self.subTest(change=change):
                pose = [landmark(**change) for _ in range(33)]
                result = extract_foot_landmarks(pose_result(pose), 640, 480)
                self.assertFalse(any(result.left.points))

    def test_boundary_coordinates_stay_inside_image(self):
        pose = [landmark(x=1, y=1) for _ in range(33)]
        result = extract_foot_landmarks(pose_result(pose), 640, 480)
        self.assertEqual((result.left.ankle.x, result.left.ankle.y), (639, 479))

    @patch("src.foot_tracker.cv2.putText")
    @patch("src.foot_tracker.cv2.line")
    @patch("src.foot_tracker.cv2.circle")
    def test_mirrored_rendering_preserves_anatomical_colors(
        self, circle, line, text,
    ):
        result = extract_foot_landmarks(pose_result(), 640, 480)
        draw_foot_landmarks(np.zeros((480, 640, 3), np.uint8), result)
        self.assertEqual(circle.call_args_list[0].args[1], (479, 360))
        self.assertEqual(circle.call_args_list[0].args[3], (0, 255, 0))
        self.assertEqual(circle.call_args_list[3].args[3], (255, 0, 0))
        self.assertEqual(line.call_count, 6)


class TrackerTest(unittest.TestCase):
    def setUp(self):
        self.file_patch = patch.object(Path, "is_file", return_value=True)
        self.file_patch.start()
        self.addCleanup(self.file_patch.stop)
        factory_patch = patch(
            "src.foot_tracker.vision.PoseLandmarker.create_from_options"
        )
        self.factory = factory_patch.start()
        self.addCleanup(factory_patch.stop)
        self.model = self.factory.return_value
        self.model.detect_for_video.return_value = pose_result()

    @patch("src.foot_tracker.time.monotonic_ns", return_value=1_000_000)
    def test_rgb_video_timestamps_and_single_initialization(self, clock):
        frame = np.full((2, 3, 3), [10, 20, 30], dtype=np.uint8)
        with FootTracker() as tracker:
            tracker.process(frame)
            tracker.process(frame)
        calls = self.model.detect_for_video.call_args_list
        self.assertEqual([call.args[1] for call in calls], [1, 2])
        np.testing.assert_array_equal(
            calls[0].args[0].numpy_view()[0, 0], [30, 20, 10]
        )
        self.factory.assert_called_once()
        self.assertEqual(self.factory.call_args.args[0].running_mode.name,
                         "VIDEO")
        self.model.close.assert_called_once()

    def test_initialization_failure(self):
        self.factory.side_effect = RuntimeError("bad model")
        with self.assertRaisesRegex(FootTrackerError, "Could not load"):
            FootTracker()

    def test_missing_model_has_setup_message(self):
        with patch.object(Path, "is_file", return_value=False):
            with self.assertRaisesRegex(FootTrackerError, "README.md"):
                FootTracker()
        self.factory.assert_not_called()

    def test_inference_failure_closes_model(self):
        self.model.detect_for_video.side_effect = RuntimeError("inference")
        with self.assertRaises(FootTrackerError):
            with FootTracker() as tracker:
                tracker.process(np.zeros((2, 2, 3), np.uint8))
        tracker.close()
        self.model.close.assert_called_once()

    @patch("src.camera.cv2.destroyAllWindows")
    @patch("src.camera.cv2.namedWindow")
    @patch("src.camera.Camera")
    def test_inference_failure_releases_camera_and_model(
        self, camera_class, window, destroy,
    ):
        camera = camera_class.return_value
        camera.read.return_value = np.zeros((4, 6, 3), np.uint8)
        self.model.detect_for_video.side_effect = RuntimeError("inference")
        with self.assertRaises(FootTrackerError):
            with FootTracker() as tracker:
                run_camera_preview(frame_processor=tracker.process)
        camera.release.assert_called_once()
        destroy.assert_called_once()
        self.model.close.assert_called_once()

    @patch("src.camera.cv2.destroyAllWindows")
    @patch("src.camera.cv2.waitKey", return_value=27)
    @patch("src.camera.cv2.imshow")
    @patch("src.camera.cv2.namedWindow")
    @patch("src.camera.Camera")
    def test_camera_pipeline_receives_clean_frame_and_cleans_up(
        self, camera_class, window, show, key, destroy,
    ):
        raw = np.zeros((4, 6, 3), np.uint8)
        camera = camera_class.return_value
        camera.read.return_value = raw
        with FootTracker() as tracker:
            def process(frame):
                self.assertIs(frame, raw)
                result = tracker.process(frame)
                return draw_foot_landmarks(frame.copy(), result)

            self.assertTrue(run_camera_preview(2, process))
        camera.read.assert_called_once_with(mirror=False, overlay=False)
        camera.release.assert_called_once()
        camera.draw_fps.assert_called_once()
        destroy.assert_called_once()
        self.model.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
