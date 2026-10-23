"""Tests for webcam handling that do not require a physical camera."""

import unittest
from unittest.mock import Mock, patch

import cv2
import numpy as np

from src.camera import Camera, CameraError, run_camera_preview


class CameraTest(unittest.TestCase):
    """Exercise camera capture and preview cleanup using mock devices."""

    def make_capture(self, opened=True, frames=None):
        capture = Mock()
        capture.isOpened.return_value = opened
        default_frame = np.zeros((2, 3, 3), dtype=np.uint8)
        capture.read.side_effect = frames or [(True, default_frame)]
        return capture

    def test_initializes_selected_camera_and_requests_resolution(self):
        capture = self.make_capture()
        factory = Mock(return_value=capture)

        camera = Camera(camera_index=2, capture_factory=factory)

        factory.assert_called_once_with(2)
        capture.set.assert_any_call(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        capture.set.assert_any_call(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        camera.release()

    def test_reads_and_mirrors_a_frame(self):
        frame = np.array([[[1, 0, 0], [2, 0, 0]]], dtype=np.uint8)
        capture = self.make_capture(frames=[(True, frame)])
        camera = Camera(capture_factory=Mock(return_value=capture))

        result = camera.read()

        self.assertIsNotNone(result)
        np.testing.assert_array_equal(result[0, :, 0], [2, 1])
        camera.release()

    def test_returns_none_when_frame_capture_fails(self):
        capture = self.make_capture(frames=[(False, None)])
        camera = Camera(capture_factory=Mock(return_value=capture))

        self.assertIsNone(camera.read())
        camera.release()

    def test_releases_capture_when_camera_cannot_open(self):
        capture = self.make_capture(opened=False)

        with self.assertRaises(CameraError):
            Camera(capture_factory=Mock(return_value=capture))

        capture.release.assert_called_once()

    @patch("src.camera.cv2.destroyAllWindows")
    @patch("src.camera.cv2.waitKey", return_value=ord("q"))
    @patch("src.camera.cv2.imshow")
    @patch("src.camera.cv2.namedWindow")
    @patch("src.camera.cv2.VideoCapture")
    def test_keyboard_exit_releases_camera_and_closes_window(
        self, video_capture, named_window, imshow, wait_key, destroy_windows
    ):
        capture = self.make_capture()
        video_capture.return_value = capture

        result = run_camera_preview()

        self.assertTrue(result)
        capture.release.assert_called_once()
        named_window.assert_called_once()
        imshow.assert_called_once()
        wait_key.assert_called_once_with(1)
        destroy_windows.assert_called_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
