# 2649-bka 3D model source (LEOHARDT LOAFER, black)

Editable source for `public/models/2649-bka.glb`, the first catalog product's
3D View slide.

- `shape.json` holds every measurement and feature placement: footprint
  widths, sole and heel profile, collar line, vamp ridge, heel cup, strap,
  apron seam, horsebit and materials.
- `scripts/build-shoe-model.mjs` turns it into the GLB.
- Regenerate with `npm run model:2649-bka` from `frontend/`.
- `comparisons/` holds the photo-vs-model reviews used to fit it.

This is a procedural approximation fitted to the catalog photos. It is
**not a scan**.

## Coordinates (for camera try-on)

- **Axes:** metres, +Y up, toe toward +Z. This is a **right shoe**, so the
  medial (big-toe) side is +X.
- **Origin:** on the ground plane, at mid-footprint on the heel-toe axis.
- **Size and markers:** EU 42, 285 mm outsole length. The `heel_back`,
  `toe_tip`, `ball_medial` and `ball_lateral` marker nodes and the root
  `extras` record the alignment points.

## How it was fitted

The references are the five local photos in `data/logo-formal/images/2649-bka/`.

**Side (`03-side.jpg`).** The model silhouette was rasterised from the camera
recovered by search: 10° elevation, 3° yaw. It was compared with the photo
mask, which excludes the grey floor shadow. Profile residuals were reduced to
about ±3 mm, and the silhouette overlap (IoU) reached 0.961 (the previous model
scored 0.891).

**Top (`04-top.jpg`, image-left shoe = right shoe).** Width per row matches
within about 1 mm, and IoU reached 0.975 (previous model 0.932).

**Three-quarter (`02-angled.jpg`, front shoe) and sole (`05-sole.jpg`).** These
were compared visually. Automatic camera recovery was unreliable because the
pair overlaps in the photo.

## Approximations and unverified areas

- **Heel back:** no photo shows the shoe from behind. The heel-cup curl and the
  collar line across the back are inferred, and from above a small notch shows
  where the two collar bindings meet.
- **Toe:** from the three-quarter angle the model's toe still reads slightly
  longer and less bulbous than the photo. The photo has strong close-camera
  perspective. The top-view widths match.
- **Outsole:** the tread dimples are a normal map. The heel top-lift's shaped
  border, the LOGO plate and the "42" size mark are not modelled.
- **Buckle:** simplified to a capsule bar with an oval centre plate, two
  collars, two horseshoe rings, short prongs and leather keepers. There is no
  engraving.
- **Leather:** the pebble grain is procedural, and the sheen is a soft clear
  coat. The studio lighting in the photos differs from the neutral viewer
  lighting.
- **Interior:** the insole logo and "Noir Collection" print are omitted. The
  lining and insole colours were sampled from the photos.
- **Left shoe:** not modelled. Mirroring X gives one.
