/**
 * @file Hogwarts castle blueprint for the modular kit: halls, round and
 * square towers, curtain walls, gatehouses, the stone viaduct and paved
 * courtyards. Positions are [x, z] on the plateau (the builder reads the
 * ground height); rotations are yaw in radians. Also the kit's shared
 * proportions (window shapes, battlements, roof pitch, trims).
 */

export const KIT = Object.freeze({
  stoneTile: 3,
  roofTile: 2.2,
  merlon: { width: 1.1, gap: 0.9, height: 1.1, depth: 0.7 },
  corbel: { height: 0.8, out: 0.45 },
  plinth: { height: 1.2, out: 0.35 },
  roofOverhang: 0.8,
  window: { frame: 0.28, depth: 0.45, inset: 0.18, archRatio: 0.9 },
  towerSegments: 28,
  buttress: { width: 1.6, depth: 1.4, steps: 3 },
  turret: { radius: 2.4, above: 7, roof: 5 },
  finial: { height: 3, radius: 0.18 },
  flag: { length: 3.2, height: 1.6, pole: 5 },
  foundationBelow: 1.5,
  door: { thickness: 0.25, strap: 0.1 },
  /** Night glow of the windows (0..1 share lit, colour). */
  windowLit: 0.62,
  windowColor: '#ffc27a',
  clock: { radius: 2.4, above: 0.72 },
});

export const CASTLE = Object.freeze({
  groundY: 42,
  halls: [
    { name: 'Giriş Holü', pos: [-15, -50], size: [44, 30], height: 24, roofAxis: 'x', roofPitch: 0.8, windows: { spacing: 7, width: 2.4, height: 6, sill: 9 }, buttresses: true, turrets: true, door: { side: 'n', width: 6, height: 9 } },
    { name: 'Bağlantı', pos: [-15, -27], size: [14, 16], height: 16, roofAxis: 'z', roofPitch: 0.7, windows: { spacing: 6, width: 1.6, height: 4, sill: 7 } },
    { name: 'Büyük Salon', pos: [-15, 5], size: [26, 50], height: 21, roofAxis: 'z', roofPitch: 0.85, windows: { spacing: 7.5, width: 2.8, height: 10, sill: 6 }, buttresses: true },
    { name: 'Kütüphane kanadı', pos: [40, -20], size: [22, 60], height: 18, roofAxis: 'z', roofPitch: 0.75, windows: { spacing: 6.5, width: 2, height: 5, sill: 6 }, buttresses: true },
    { name: 'Güney salonu', pos: [-10, 75], size: [60, 22], height: 20, roofAxis: 'x', roofPitch: 0.8, windows: { spacing: 7, width: 2.2, height: 6, sill: 7 }, turrets: true },
    { name: 'Astronomi geçidi', pos: [-55, 68], size: [24, 12], height: 16, roofAxis: 'x', roofPitch: 0.7, windows: { spacing: 6, width: 1.6, height: 4, sill: 7 } },
    { name: 'Gryffindor geçidi', pos: [33, 66], size: [26, 12], height: 16, roofAxis: 'x', roofPitch: 0.7, windows: { spacing: 6, width: 1.6, height: 4, sill: 7 } },
  ],
  towers: [
    { name: 'Astronomi Kulesi', pos: [-75, 60], radius: 9, height: 70, roofHeight: 17, windowRings: 6, flag: 'none' },
    { name: 'Gryffindor Kulesi', pos: [50, 60], radius: 8, height: 58, roofHeight: 14, windowRings: 5, flag: 'gryffindor' },
    { name: 'Ravenclaw Kulesi', pos: [-80, -118], radius: 8, height: 52, roofHeight: 14, windowRings: 5, flag: 'ravenclaw' },
    { name: 'Güney burcu', pos: [-60, 118], radius: 11, height: 30, roofHeight: 10, windowRings: 2, flag: 'hufflepuff' },
    { name: 'Zindan burcu', pos: [30, 128], radius: 10, height: 26, roofHeight: 9, windowRings: 2, flag: 'slytherin' },
    { name: 'Batı burcu', pos: [-122, -40], radius: 6, height: 24, roofHeight: 8, windowRings: 2 },
    { name: 'Doğu burcu', pos: [120, -45], radius: 6, height: 24, roofHeight: 8, windowRings: 2 },
    { name: 'Güneydoğu burcu', pos: [110, 62], radius: 6.5, height: 28, roofHeight: 9, windowRings: 2 },
  ],
  squareTowers: [
    { name: 'Saat Kulesi', pos: [78, -118], size: 13, height: 44, roofHeight: 12, clock: true },
  ],
  walls: [
    { from: [-72, -118], to: [-12, -118] },
    { from: [12, -118], to: [71, -118] },
    { from: [84, -112], to: [116, -50] },
    { from: [121, -40], to: [122, -15] },
    { from: [122, -1], to: [112, 57] },
    { from: [104, 64], to: [57, 64] },
    { from: [47, 68], to: [34, 120] },
    { from: [21, 130], to: [-50, 121] },
    { from: [-68, 110], to: [-74, 69] },
    { from: [-84, 57], to: [-122, 48] },
    { from: [-127, 36], to: [-127, 16] },
    { from: [-126, 6], to: [-122, -34] },
    { from: [-118, -46], to: [-86, -112] },
  ],
  wall: { height: 12, thickness: 2.6 },
  gates: [
    { name: 'Kuzey kapısı', pos: [0, -118], yaw: 0, width: 7, height: 9, towerRadius: 4.5, towerHeight: 19, span: 24 },
    { name: 'Köprü kapısı', pos: [122, -8], yaw: -Math.PI / 2, width: 6, height: 8, towerRadius: 3.6, towerHeight: 16, span: 14 },
    { name: 'Batı kapısı', pos: [-127, 11], yaw: Math.PI / 2, width: 5, height: 7, towerRadius: 3.2, towerHeight: 14, span: 10 },
  ],
  viaduct: { from: [128, -8], to: [300, -12], width: 6.4, arch: 14, parapet: 1.1, deckThickness: 1.4, pierWidth: 3.2 },
  /** Paved areas (terrain splat), ellipses {center, radii}. */
  paving: [
    { center: [0, -92], radii: [62, 26] },
    { center: [86, -10], radii: [34, 48] },
    { center: [-80, 0], radii: [30, 50] },
    { center: [15, -58], radii: [70, 12] },
    { center: [-10, 105], radii: [44, 12] },
    { center: [-140, 12], radii: [16, 10] },
  ],
});
