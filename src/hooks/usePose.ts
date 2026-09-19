import { useEffect, useRef } from 'react';
import { DeviceMotion, Magnetometer } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { wrap360, wrapDiff } from '../lib/geo';
import { SHAKE_ACCEL_THRESHOLD } from '../config';

/**
 * Camera pose from sensor fusion, no ARKit needed:
 *  - pitch/roll straight from the gravity vector,
 *  - yaw = gyro integration about the world-up axis (fast, smooth) slowly corrected
 *    toward a tilt-compensated magnetometer heading of the *camera axis* (absolute).
 * Device frame: X right, Y up (top of phone), Z out of the screen. Back camera looks along -Z.
 * All angles in degrees. yaw is a compass heading (0 = magnetic north, clockwise).
 */
export type Pose = { yaw: number; pitch: number; roll: number; ready: boolean };

export function usePose(onShake?: (magnitudeG: number) => void) {
  const yawSV = useSharedValue(0);
  const pitchSV = useSharedValue(0);
  const rollSV = useSharedValue(0);
  const pose = useRef<Pose>({ yaw: 0, pitch: 0, roll: 0, ready: false });
  const shakeCb = useRef(onShake);
  shakeCb.current = onShake;

  useEffect(() => {
    let g = [0, -9.8, 0]; // filtered gravity (device frame, points down)
    let up = [0, 1, 0];
    let mag: number[] | null = null;
    let magYaw: number | null = null;
    let yaw: number | null = null;
    let lastT = 0;
    let lastShakeT = 0;

    const computeMagYaw = () => {
      if (!mag) return;
      const m = mag;
      const mu = m[0] * up[0] + m[1] * up[1] + m[2] * up[2];
      const mh = [m[0] - mu * up[0], m[1] - mu * up[1], m[2] - mu * up[2]];
      const ml = Math.hypot(mh[0], mh[1], mh[2]);
      if (ml < 1e-3) return;
      const n = [mh[0] / ml, mh[1] / ml, mh[2] / ml];
      const e = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
      // camera axis c = (0,0,-1); horizontal part ch = c - (c·up)up
      const cu = -up[2];
      const ch = [-cu * up[0], -cu * up[1], -1 - cu * up[2]];
      const cl = Math.hypot(ch[0], ch[1], ch[2]);
      if (cl < 1e-3) return; // pointing straight up/down: heading undefined, keep last
      const hn = (ch[0] * n[0] + ch[1] * n[1] + ch[2] * n[2]) / cl;
      const he = (ch[0] * e[0] + ch[1] * e[1] + ch[2] * e[2]) / cl;
      magYaw = wrap360((Math.atan2(he, hn) * 180) / Math.PI);
    };

    DeviceMotion.setUpdateInterval(16);
    Magnetometer.setUpdateInterval(50);

    const subM = Magnetometer.addListener((f) => {
      mag = [f.x, f.y, f.z];
      computeMagYaw();
    });

    const sub = DeviceMotion.addListener((d) => {
      const a = d.accelerationIncludingGravity;
      if (!a) return;
      const t = a.timestamp ?? Date.now() / 1000;
      const dt = lastT ? Math.min(0.1, Math.max(0, t - lastT)) : 0;
      lastT = t;

      // low-pass gravity (CoreMotion already separates user accel; this just steadies it)
      const k = 0.35;
      g = [g[0] + k * (a.x - g[0]), g[1] + k * (a.y - g[1]), g[2] + k * (a.z - g[2])];
      const gl = Math.hypot(g[0], g[1], g[2]) || 1;
      up = [-g[0] / gl, -g[1] / gl, -g[2] / gl];

      const pitch = (Math.asin(Math.max(-1, Math.min(1, g[2] / gl))) * 180) / Math.PI; // camera elevation
      const roll = (Math.atan2(g[0], -g[1]) * 180) / Math.PI; // clockwise tilt of the phone

      // gyro yaw integration about world up; positive (right-hand) rotation = counter-clockwise
      // from above = decreasing compass heading.
      const rr = d.rotationRate;
      if (rr && yaw != null && dt > 0) {
        const wUp = rr.gamma * up[0] + rr.beta * up[1] + rr.alpha * up[2]; // deg/s (gamma=x, beta=y, alpha=z)
        yaw = wrap360(yaw - wUp * dt);
      }
      if (magYaw != null) {
        if (yaw == null) yaw = magYaw;
        else yaw = wrap360(yaw + 0.03 * wrapDiff(magYaw, yaw));
      }

      // shake detection from user acceleration magnitude
      const ua = d.acceleration;
      if (ua && shakeCb.current) {
        const mg = Math.hypot(ua.x, ua.y, ua.z) / 9.80665;
        if (mg > SHAKE_ACCEL_THRESHOLD && t - lastShakeT > 0.12) {
          lastShakeT = t;
          shakeCb.current(mg);
        }
      }

      const y = yaw ?? 0;
      pose.current = { yaw: y, pitch, roll, ready: yaw != null };
      yawSV.value = y;
      pitchSV.value = pitch;
      rollSV.value = roll;
    });

    return () => { sub.remove(); subM.remove(); };
  }, []);

  return { yawSV, pitchSV, rollSV, pose } as {
    yawSV: SharedValue<number>; pitchSV: SharedValue<number>; rollSV: SharedValue<number>;
    pose: React.MutableRefObject<Pose>;
  };
}
