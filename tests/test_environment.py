"""Verify that the core computer vision dependencies are available."""

import unittest

import cv2
import mediapipe
import numpy


class EnvironmentTest(unittest.TestCase):
    """Check imports and report the installed dependency versions."""

    def test_core_dependencies_are_installed(self):
        self.assertTrue(cv2.__version__)
        self.assertTrue(mediapipe.__version__)
        self.assertTrue(numpy.__version__)

        print(f"OpenCV: {cv2.__version__}")
        print(f"MediaPipe: {mediapipe.__version__}")
        print(f"NumPy: {numpy.__version__}")
        print("Environment ready.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
