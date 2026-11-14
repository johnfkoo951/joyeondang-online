'use client';
import { useEffect, type RefObject } from 'react';
import { TRAIL_FLUSH_MS, TRAIL_POINTS_MAX, TRAIL_SAMPLE_MS, movedEnough, trailPoint, type TrailPoint } from '@/lib/social';
import type { WalkController } from '@/walk/scene';

const TEXT = 'text/plain;charset=UTF-8';

/**
 * 걸은 길 기록. 실제 집·방 안(space가 있을 때)에서 1초마다 내 자리를 보고, 5cm 넘게 움직였으면 점 하나
 * [ms, x, y, z, yaw]를 모은다(처음 자리도 한 점). 30초마다 보내고, 공간이 바뀌거나 페이지를 떠나거나 탭이 가려지면
 * 남은 점을 sendBeacon으로 보낸다. 명단 밖이라는 답(404)이 오면 그 공간에서는 그만 모은다.
 */
export function useTrail(o: { enabled: boolean; space: string | null; ctrl: RefObject<WalkController | null> }): void {
  const { enabled, space, ctrl } = o;
  useEffect(() => {
    if (!enabled || !space) return;
    let buf: TrailPoint[] = [];
    let last: TrailPoint | null = null;
    let sending = false;
    let stopped = false;
    const body = (points: TrailPoint[]) => JSON.stringify({ space, points, sent: Date.now() });
    const keep = (points: TrailPoint[]) => {
      buf = [...points, ...buf].slice(-TRAIL_POINTS_MAX);
    };

    const sample = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const c = ctrl.current;
      if (!c || typeof c.getState !== 'function') return;
      const s = c.getState();
      if (!movedEnough(last, s)) return;
      last = trailPoint(Date.now(), s);
      buf.push(last);
      if (buf.length > TRAIL_POINTS_MAX) buf = buf.slice(buf.length - TRAIL_POINTS_MAX);
    };

    const flush = async () => {
      if (stopped || sending || buf.length === 0) return;
      const points = buf;
      buf = [];
      sending = true;
      try {
        const r = await fetch('/api/trail', {
          method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': TEXT }, body: body(points),
        });
        if (r.status === 404) stopped = true;
        // 서버가 잠깐 못 받았으면 다음에 함께 보낸다(모양이 틀렸거나 한도면 버린다)
        else if (r.status >= 500) keep(points);
      } catch {
        keep(points);
      } finally {
        sending = false;
      }
    };

    // 떠날 때: 기다리지 않고 보낸다(sendBeacon이 안 되면 keepalive 요청)
    const beacon = () => {
      if (stopped || buf.length === 0) return;
      const points = buf;
      buf = [];
      const text = body(points);
      let sent = false;
      try {
        sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/trail', new Blob([text], { type: TEXT }));
      } catch {
        sent = false;
      }
      if (!sent) {
        void fetch('/api/trail', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': TEXT }, body: text })
          .catch(() => {});
      }
    };

    const sampler = window.setInterval(sample, TRAIL_SAMPLE_MS);
    const flusher = window.setInterval(() => void flush(), TRAIL_FLUSH_MS);
    const onVis = () => {
      if (document.visibilityState === 'hidden') beacon();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', beacon);
    return () => {
      window.clearInterval(sampler);
      window.clearInterval(flusher);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', beacon);
      // 공간이 바뀌었거나 걷기 화면을 닫았다: 이 공간에서 모은 것을 보낸다
      beacon();
    };
  }, [enabled, space, ctrl]);
}
