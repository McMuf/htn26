import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { clamp, wrapDiff } from '../lib/geo';
import { getPose } from '../hooks/usePose';
import { useStore } from '../store';
import { WALL_HALF_X, WALL_HALF_Y, getWall, hasWall } from './Wall';

export type WallView = {
  canvasId: string;
  heading: number; // canvas centre heading
  resolve: number; // 0 = invisible/blurred, 1 = crisp
};

const D2R = Math.PI / 180;
/** Where the wall stands, in CSS px. Arbitrary: the perspective divide only cares about ratios. */
const WALL_DISTANCE = 1200;

// fixed, under the HUD (which should sit at z-index ≥ 10), over the camera <video> (z-index ≤ 1)
const STYLE: CSSProperties = {
  position: 'fixed', inset: 0, width: '100%', height: '100%',
  pointerEvents: 'none', zIndex: 2, display: 'block', touchAction: 'none',
  overflow: 'hidden', perspectiveOrigin: '50% 50%',
};

/**
 * Draws every nearby wall as what it is: a flat surface standing in front of the spot its author
 * painted from. Each wall's raster is parked in a 3D-transformed element, so the browser gives it
 * a real perspective divide — look along the wall and the paint foreshortens, tilt and it keeps
 * its horizon, exactly like paint on a wall. (It used to be blitted with a 2D translate + rotate,
 * which never foreshortens: paint slid around the screen like a sticker on a sphere, which is the
 * "it doesn't sit on surfaces" feeling.)
 *
 * The wall element holds the Wall's own offscreen canvas, so painting shows up with no per-frame
 * blit; a frame only rewrites transforms, which stay on the compositor. Runs its own rAF loop off
 * getPose() so it never re-renders React.
 *
 * What this still isn't: plane *detection*. A browser has no depth sensor and no position
 * tracking, so the wall is where the canvas says it is rather than where the real wall is, and
 * walking around doesn't parallax. On the phone, ARKit/ARCore do the real thing.
 */
export function PaintLayer({ walls }: { walls: WallView[] }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const wallsRef = useRef(walls);
  wallsRef.current = walls;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    /** one positioned element per canvas, holding that Wall's raster */
    const mounted = new Map<string, HTMLDivElement>();

    const surfaceFor = (id: string) => {
      let el = mounted.get(id);
      if (el) return el;
      const wall = getWall(id);
      el = document.createElement('div');
      el.style.cssText = [
        'position:absolute', 'left:50%', 'top:50%',
        `width:${2 * WALL_HALF_X * WALL_DISTANCE}px`,
        `height:${2 * WALL_HALF_Y * WALL_DISTANCE}px`,
        'margin-left:' + -WALL_HALF_X * WALL_DISTANCE + 'px',
        'margin-top:' + -WALL_HALF_Y * WALL_DISTANCE + 'px',
        'transform-origin:50% 50%', 'will-change:transform', 'backface-visibility:hidden',
      ].join(';');
      const c = wall.canvas;
      c.style.cssText = 'width:100%;height:100%;display:block';
      el.appendChild(c);
      host.appendChild(el);
      mounted.set(id, el);
      return el;
    };

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const pose = getPose();
      const st = useStore.getState();
      const hfov = st.settings.hfov;
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      if (!(hfov > 0) || w <= 0 || h <= 0) return;

      // hfov spans the short edge in either orientation (roll levels the layer in landscape)
      const focal = (Math.min(w, h) / 2) / Math.tan((hfov * D2R) / 2);
      host.style.perspective = `${focal.toFixed(1)}px`;
      // CSS puts the eye `focal` in front of the z = 0 plane, so a wall parked at translateZ(-R)
      // sits at depth focal + R and lands at half the angle it should. Step out to the eye first,
      // rotate there, then go R along the rotated view axis: that is the plain pinhole camera,
      // checked against focal·tan(angle) in the browser.
      const eye = focal.toFixed(1);

      const live = new Set<string>();
      for (const wv of wallsRef.current) {
        if (!hasWall(wv.canvasId)) continue; // nothing painted there yet — don't allocate a blank raster
        live.add(wv.canvasId);
        const el = surfaceFor(wv.canvasId);
        const resolve = clamp(wv.resolve, 0, 1);
        // where this wall's centre sits relative to where we are looking
        const dYaw = wrapDiff(wv.heading, pose.yaw);
        // roll levels it, pitch swings it up/down, yaw swings it left/right, then it stands off
        // at WALL_DISTANCE along that direction — so it always faces its own spot, like a wall.
        el.style.transform =
          `translateZ(${eye}px) rotateZ(${(-pose.roll).toFixed(2)}deg) rotateX(${pose.pitch.toFixed(2)}deg) ` +
          `rotateY(${(-dYaw).toFixed(2)}deg) translateZ(${-WALL_DISTANCE}px)`;
        el.style.opacity = (0.15 + 0.85 * resolve).toFixed(3);
        // resolves from a smear into a piece as you walk up to it
        const blur = (1 - resolve) * 26;
        el.style.filter = blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : '';
      }

      // walls that dropped out of range: unmount, but leave their raster alive in the Wall cache
      for (const [id, el] of mounted) {
        if (live.has(id)) continue;
        el.remove();
        mounted.delete(id);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      for (const [, el] of mounted) el.remove();
      mounted.clear();
    };
  }, []);

  return <div ref={hostRef} style={STYLE} aria-hidden="true" />;
}
