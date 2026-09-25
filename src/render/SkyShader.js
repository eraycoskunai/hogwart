/**
 * @file SkyShader — GLSL for the physically inspired sky, shared by the sky
 * dome, the environment map and the Great Hall's enchanted ceiling.
 *
 * - Preetham daylight scattering (adapted from three.js' Sky example)
 * - night sky gradient, rotating star field with twinkle, Milky Way band
 * - moon disc with correct phase terminator, maria and glow
 * - two-layer fBm cloud deck lit by sun / moon, silver lining, overcast
 * - lightning flashes, horizon blend into the scene fog colour
 */
import * as THREE from 'three';
import { SKY } from '../data/atmosphere.js';

/** Create the uniform set; share the objects between every sky user. */
export function createSkyUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.3, 0.5, -0.2).normalize() },
    uMoonPhase: { value: 0.5 },
    uTime: { value: 0 },
    uCloudCover: { value: 0.2 },
    uCloudOffset: { value: new THREE.Vector2() },
    uLightning: { value: 0 },
    uFogColor: { value: new THREE.Color(0xbac6d0) },
    uHorizonFog: { value: 0.35 },
    uExposure: { value: SKY.exposure },
    uTurbidity: { value: SKY.turbidity },
    uRayleigh: { value: SKY.rayleigh },
    uMie: { value: SKY.mieCoefficient },
    uMieG: { value: SKY.mieDirectionalG },
    uNightColor: { value: new THREE.Vector3(...SKY.nightColor) },
    uStars: { value: SKY.starBrightness },
    uMoonSize: { value: SKY.moonSize },
    uCloudHeight: { value: SKY.cloudHeight },
    uCloudScale: { value: SKY.cloudScale },
    uStarRotation: { value: 0 },
    uPole: { value: new THREE.Vector3(0, 0.84, -0.55).normalize() },
  };
}

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uMoonPhase;
uniform float uTime;
uniform float uCloudCover;
uniform vec2 uCloudOffset;
uniform float uLightning;
uniform vec3 uFogColor;
uniform float uHorizonFog;
uniform float uExposure;
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uMie;
uniform float uMieG;
uniform vec3 uNightColor;
uniform float uStars;
uniform float uMoonSize;
uniform float uCloudHeight;
uniform float uCloudScale;
uniform float uStarRotation;
uniform vec3 uPole;

#define SKY_PI 3.141592653589793
#define SKY_E 2.718281828459045

// --- Preetham (three.js Sky.js, MIT) --------------------------------------
const vec3 SKY_totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 SKY_MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);

vec3 skyPreetham(vec3 direction, vec3 sunDir) {
  vec3 up = vec3(0.0, 1.0, 0.0);
  float zenithCos = clamp(dot(sunDir, up), -1.0, 1.0);
  float sunE = 1000.0 * max(0.0, 1.0 - pow(SKY_E, -((1.6110731556870734 - acos(zenithCos)) / 1.5)));
  float sunfade = 1.0 - clamp(1.0 - exp(sunDir.y), 0.0, 1.0);
  float rayleighCoefficient = uRayleigh - (1.0 - sunfade);
  vec3 betaR = SKY_totalRayleigh * rayleighCoefficient;
  vec3 betaM = 0.434 * (0.2 * uTurbidity) * 10E-18 * SKY_MieConst * uMie;

  float zenithAngle = acos(max(0.0, dot(up, direction)));
  float inv = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / SKY_PI), -1.253));
  float sR = 8.4E3 * inv;
  float sM = 1.25E3 * inv;
  vec3 Fex = exp(-(betaR * sR + betaM * sM));
  float cosTheta = dot(direction, sunDir);
  float rPhase = 0.05968310365946075 * (1.0 + pow(cosTheta * 0.5 + 0.5, 2.0));
  float g2 = uMieG * uMieG;
  float mPhase = 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0 * uMieG * cosTheta + g2, 1.5));
  vec3 betaRTheta = betaR * rPhase;
  vec3 betaMTheta = betaM * mPhase;
  vec3 Lin = pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * Fex, vec3(0.5)), clamp(pow(1.0 - dot(up, sunDir), 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisk = smoothstep(0.99995, 0.99997, cosTheta);
  L0 += (sunE * 19000.0 * Fex) * sundisk;
  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  return pow(texColor, vec3(1.0 / (1.2 + (1.2 * sunfade))));
}

// --- noise ----------------------------------------------------------------
float skyHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float skyHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float skyFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * skyNoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
vec3 skyRotate(vec3 v, vec3 axis, float ang) {
  float c = cos(ang), s = sin(ang);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

// --- composition ------------------------------------------------------------
vec3 skyRadiance(vec3 dir) {
  vec3 sun = normalize(uSunDir);
  float sunEl = sun.y;
  float up = max(dir.y, 0.0);
  float dayF = smoothstep(-0.12, 0.08, sunEl);
  float night = 1.0 - smoothstep(-0.2, 0.02, sunEl);

  vec3 col = skyPreetham(normalize(vec3(dir.x, max(dir.y, 0.001), dir.z)), sun) * uExposure;
  col += uNightColor * (0.55 + 0.9 * (1.0 - up)) * night;

  // Stars and Milky Way, rotating about the celestial pole.
  vec3 sd = skyRotate(dir, normalize(uPole), uStarRotation);
  vec3 cell = floor(sd * 220.0);
  float h = skyHash3(cell);
  float star = 0.0;
  if (h > 0.9965) {
    vec3 c = (cell + 0.5 + (vec3(skyHash3(cell + 1.3), skyHash3(cell + 2.7), skyHash3(cell + 4.1)) - 0.5) * 0.6) / 220.0;
    float d = length(sd - normalize(c)) * 220.0;
    float tw = 0.75 + 0.25 * sin(uTime * (2.0 + h * 40.0) + h * 100.0);
    star = smoothstep(0.55, 0.0, d) * (h - 0.9965) / 0.0035 * tw;
  }
  float band = exp(-pow(dot(sd, normalize(vec3(0.3, 0.2, 0.93))) * 5.0, 2.0));
  float milky = band * skyFbm(sd.xy * 9.0 + sd.z * 3.0) * 0.35;
  vec3 starCol = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), h);
  float horizonFade = smoothstep(0.0, 0.15, dir.y);
  col += (starCol * star * uStars + vec3(0.55, 0.6, 0.8) * milky * 0.06) * night * horizonFade;

  // Moon with phase.
  vec3 m = normalize(uMoonDir);
  float md = dot(dir, m);
  float moonUp = smoothstep(-0.05, 0.05, m.y);
  float pa = uMoonPhase * 2.0 * SKY_PI;
  float illum = 0.5 - 0.5 * cos(pa);
  vec3 right = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
  vec3 upv = cross(right, m);
  vec2 dp = vec2(dot(dir, right), dot(dir, upv)) / uMoonSize;
  float r2 = dot(dp, dp);
  if (md > 0.0 && r2 < 1.0) {
    vec3 nrm = vec3(dp, sqrt(1.0 - r2));
    vec3 L = vec3(sin(pa), 0.0, -cos(pa));
    float lit = smoothstep(-0.04, 0.12, dot(nrm, L));
    float maria = skyFbm(dp * 2.4 + 7.0);
    vec3 moonCol = vec3(0.95, 0.94, 0.88) * (0.72 + 0.35 * maria) * (lit * 1.6 + 0.015);
    float edge = smoothstep(1.0, 0.92, r2);
    col = mix(col, moonCol * moonUp + col * (1.0 - moonUp), edge * mix(1.0, 0.35, dayF));
  }
  float glow = pow(max(md, 0.0), 600.0) * 0.35 + pow(max(md, 0.0), 30.0) * 0.05;
  col += vec3(0.6, 0.68, 0.9) * glow * illum * moonUp * (1.0 - dayF * 0.8);

  // Cloud deck.
  vec3 sunTint = mix(vec3(1.0, 0.5, 0.3), vec3(1.0, 0.98, 0.95), smoothstep(0.0, 0.35, sunEl));
  if (dir.y > 0.0) {
    vec2 cuv = dir.xz / (dir.y + uCloudHeight) * uCloudScale + uCloudOffset;
    float n1 = skyFbm(cuv);
    float n2 = skyFbm(cuv * 2.7 + vec2(4.1, 1.7) - uCloudOffset * 0.5);
    float thr = mix(0.72, 0.18, uCloudCover);
    float dens = smoothstep(thr, thr + 0.28, n1 * 0.72 + n2 * 0.28);
    float thick = smoothstep(0.25, 1.0, dens);
    vec3 moonLit = vec3(0.05, 0.055, 0.07) * (0.35 + 0.65 * illum * moonUp);
    vec3 lit = mix(moonLit, sunTint * 0.95, dayF);
    vec3 base = lit * (1.0 - thick * 0.5) * mix(1.0, 0.5, uCloudCover * uCloudCover);
    base += sunTint * pow(max(dot(dir, sun), 0.0), 10.0) * (1.0 - thick) * 0.7 * dayF;
    base += vec3(0.75, 0.8, 1.0) * uLightning * (0.4 + n1);
    float fade = smoothstep(0.0, 0.1, dir.y);
    col = mix(col, base, dens * fade);
  }

  // Overcast veil and lightning.
  vec3 overcastCol = mix(vec3(0.018, 0.02, 0.028), vec3(0.5, 0.53, 0.57) * sunTint, dayF);
  col = mix(col, overcastCol, smoothstep(0.55, 1.0, uCloudCover) * 0.75);
  col += vec3(0.45, 0.5, 0.65) * uLightning * 0.3;

  // Blend into the fog colour at the horizon; darker ground below it.
  float hz = 1.0 - smoothstep(-0.02, 0.3, dir.y);
  col = mix(col, uFogColor, hz * uHorizonFog);
  if (dir.y < 0.0) col = mix(col, uFogColor * 0.6, smoothstep(0.0, -0.3, dir.y));
  return col;
}
`;
