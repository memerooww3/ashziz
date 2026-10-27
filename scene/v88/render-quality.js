// Recomputed on zoom/resize: the framebuffer must follow physical pixels,
// rather than retaining the DPR from the first page load.
export const RENDER_PIXEL_BUDGET = 3840 * 2160;
// The screen's own pixel density (pinch zoom included), capped at 2x on desktop and 1.6x on mobile:
// on phones with 3x-4x DPR, 1.6x preserves razor-sharp visuals on dense mobile OLED screens while
// cutting fillrate and memory bandwidth pressure by over 35%, ensuring smooth 60fps on mobile GPUs.
export function renderPixelRatio(width, height, deviceRatio = 1, visualZoom = 1, maxTextureSize = 16384) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const isMobile = (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) || Math.min(w, h) < 600;
  const maxCap = isMobile ? 1.6 : 2;
  return Math.min(
    Math.max(1, deviceRatio * Math.max(1, visualZoom)),
    maxCap,
    Math.sqrt(RENDER_PIXEL_BUDGET / (w * h)),
    maxTextureSize / Math.max(w, h),
  );
}
