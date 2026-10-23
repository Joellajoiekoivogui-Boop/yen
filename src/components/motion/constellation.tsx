"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Particle = { x: number; y: number; vx: number; vy: number; r: number; gold: boolean };
type Ring = { x: number; y: number; t0: number };

const LINK = 110; // distance max entre deux points reliés (px)
const REACH = 170; // portée du pointeur (px)
const RING_MS = 900;

/**
 * Constellation interactive en fond du héros (canvas décoratif) : des points dorés et bleus
 * flottent et se relient ; ils se tendent vers la souris, et un clic ou un toucher lance
 * une onde qui les écarte.
 * Démarre une fois la page au repos (n'affecte pas l'affichage initial), s'arrête hors de
 * l'écran, onglet masqué, animations en pause ([data-motion-paused]) ou réduites.
 * Sur écran tactile, elle ne s'anime que quelques secondes à l'arrivée et après chaque
 * toucher, puis se fige : aucun calcul en continu sur téléphone.
 * Le canvas écoute son conteneur (le héros) : il ne capte jamais les clics.
 */
export function Constellation({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement?.closest("section") ?? canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    let w = 0;
    let h = 0;
    let particles: Particle[] = [];
    const rings: Ring[] = [];
    const pointer = { x: 0, y: 0, active: false };
    let frame = 0;
    let last = 0;
    let odd = false;
    let visible = true;
    let started = false;
    // tactile : animée jusqu'à cette date, puis figée
    let awakeUntil = 0;

    const seed = () => {
      // densité selon la surface ; moins de points sur téléphone
      const n = Math.round(Math.min(coarse ? 26 : 60, Math.max(18, (w * h) / 22000)));
      particles = Array.from({ length: n }, () => {
        const a = Math.random() * Math.PI * 2;
        const s = 0.12 + Math.random() * 0.28;
        return { x: Math.random() * w, y: Math.random() * h, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 0.9 + Math.random() * 1.6, gold: Math.random() < 0.32 };
      });
    };
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!particles.length) seed();
      else particles.forEach((p) => { p.x = Math.min(p.x, w); p.y = Math.min(p.y, h); });
    };

    const draw = (now: number) => {
      const dt = Math.min(3, last ? (now - last) / 16.7 : 1);
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < REACH * REACH) {
            p.vx += dx * 0.00012 * dt;
            p.vy += dy * 0.00012 * dt;
          }
        }
        // frein doux : la vitesse revient vers une dérive lente
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0.5) {
          p.vx *= 0.97;
          p.vy *= 0.97;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          ctx.strokeStyle = `rgb(173 191 228 / ${(0.28 * (1 - Math.sqrt(d2) / LINK)).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (pointer.active) {
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (d < REACH) {
            ctx.strokeStyle = `rgb(247 203 69 / ${(0.65 * (1 - d / REACH)).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        // halo en disque transparent (pas d'ombre floue, coûteuse à dessiner)
        ctx.fillStyle = p.gold ? "rgb(247 203 69 / 0.16)" : "rgb(143 174 247 / 0.14)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.gold ? "rgb(253 224 138 / 0.95)" : "rgb(214 223 242 / 0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const k = (now - rings[i].t0) / RING_MS;
        if (k >= 1) {
          rings.splice(i, 1);
          continue;
        }
        const e = 1 - Math.pow(1 - k, 3);
        ctx.strokeStyle = `rgb(247 203 69 / ${(0.7 * (1 - k)).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rings[i].x, rings[i].y, 12 + e * 220, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    };

    const running = () => visible && !document.hidden && !root.hasAttribute("data-motion-paused") && (!coarse || performance.now() < awakeUntil);
    const loop = (now: number) => {
      frame = 0;
      if (!running()) return;
      odd = !odd;
      // téléphone : une image sur deux (30 images/s) pour ménager le processeur
      if (!coarse || odd) draw(now);
      else last = now - 16.7;
      frame = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (started && !frame && running()) {
        last = 0;
        frame = requestAnimationFrame(loop);
      }
    };

    const toLocal = (ev: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") return;
      Object.assign(pointer, toLocal(ev), { active: true });
    };
    const onLeave = () => {
      pointer.active = false;
    };
    const onDown = (ev: PointerEvent) => {
      if (!started) return;
      const { x, y } = toLocal(ev);
      rings.push({ x, y, t0: performance.now() });
      awakeUntil = performance.now() + 3200;
      if (rings.length > 4) rings.shift();
      for (const p of particles) {
        const dx = p.x - x;
        const dy = p.y - y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 240) {
          const f = (1 - d / 240) * 4.2;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      wake();
    };

    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    const mo = new MutationObserver(wake);
    const start = () => {
      resize();
      started = true;
      awakeUntil = performance.now() + 2500;
      canvas.dataset.on = "";
      // tactile : dessine au moins une image, la constellation reste visible une fois figée
      draw(performance.now());
      wake();
    };
    // la constellation n'apparaît qu'une fois la page affichée et au repos
    const hasIdle = typeof window.requestIdleCallback === "function";
    const idle = hasIdle ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 1200);

    ro.observe(host);
    io.observe(host);
    mo.observe(root, { attributes: true, attributeFilter: ["data-motion-paused"] });
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("visibilitychange", wake);

    return () => {
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-1000 data-[on]:opacity-100", className)}
    />
  );
}
