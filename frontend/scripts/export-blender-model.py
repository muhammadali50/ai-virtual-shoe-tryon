"""Export the named Blender master to an intermediate web GLB. Run inside Blender or bpy."""
import sys
from pathlib import Path

import bpy

blend, destination = (Path(value).resolve() for value in sys.argv[sys.argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(blend))

# Limit the web copy independently of the packed, full-resolution source textures.
for image in bpy.data.images:
    width, height = image.size
    if max(width, height) > 1100:
        ratio = 1100 / max(width, height)
        image.scale(round(width * ratio), round(height * ratio))
        image.pack()

bpy.ops.export_scene.gltf(
    filepath=str(destination),
    export_format="GLB",
    export_yup=True,
    export_extras=True,
    export_tangents=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_image_format="WEBP",
    export_image_quality=90,
    export_image_webp_fallback=False,
)

