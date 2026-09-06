/**
 * The animated backdrop behind the application.
 *
 * Five layers, drawn entirely with SVG and CSS gradients - no images, no
 * canvas loop, no library. Everything animates with `transform` and `opacity`
 * only, which the compositor can handle without repainting, so it stays smooth
 * on a mid-range phone.
 *
 *   1. gradient atmosphere      (in CSS, .app-aurora)
 *   2. blurred light orbs       (two, drifting on long paths)
 *   3. cursor light             (a soft glow following the pointer)
 *   4. medical cross + grid     (an SVG pattern, barely there)
 *   5. circuit traces           (a dash crawling along each track)
 *   6. DNA strand               (two sine paths swaying out of phase)
 *   7. connected nodes          (the ledger idea, pulsing slowly)
 *   8. ECG trace                (one stroked path, sweeping)
 *   9. drifting motes + glyphs  (twelve and four, not hundreds)
 *
 * Restraint is the point. This sits behind medical records that people need to
 * read, so every layer is held at low opacity and the whole thing is
 * `aria-hidden` and `pointer-events-none`. It must never compete with content.
 *
 * Motion is dropped entirely for `prefers-reduced-motion`, and the parallax is
 * desktop-only: it keys off a fine pointer, so a phone never runs it.
 */
import { useEffect, useRef, useState } from "react";

/** Node positions as percentages, laid out as a loose mesh rather than a grid. */
const NODES = [
  [8, 18], [26, 10], [44, 22], [63, 12], [82, 24], [94, 14],
  [14, 46], [34, 56], [56, 44], [76, 58], [90, 46],
  [20, 82], [42, 88], [66, 78], [86, 86],
];

/** Which nodes are joined. Sparse on purpose - a full mesh reads as noise. */
const LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [0, 6], [2, 8], [4, 10],
  [6, 7], [7, 8], [8, 9], [9, 10],
  [6, 11], [7, 12], [9, 13], [10, 14],
  [11, 12], [12, 13], [13, 14],
];

const MOTES = Array.from({ length: 12 }, (_, i) => ({
  left: (i * 8.3 + 4) % 96,
  top: (i * 17.7 + 6) % 92,
  size: 3 + (i % 3) * 2,
  delay: -(i * 2.4),
  duration: 26 + (i % 5) * 6,
}));

export default function MedicalBackdrop() {
  const ref = useRef(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Only where there is a real pointer, and only if motion is welcome.
    const fine = window.matchMedia("(pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) return undefined;

    let frame = 0;
    const onMove = (e) => {
      // Throttled to one update per frame; the values are tiny by design.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;

        // The cursor light is driven by CSS variables rather than React
        // state: writing a custom property repaints one gradient, where a
        // state update would re-render the whole layer tree on every move.
        const root = ref.current;
        if (root) {
          root.style.setProperty("--mx", `${(e.clientX / window.innerWidth) * 100}%`);
          root.style.setProperty("--my", `${(e.clientY / window.innerHeight) * 100}%`);
        }

        setParallax({
          x: (e.clientX / window.innerWidth - 0.5) * 2,
          y: (e.clientY / window.innerHeight - 0.5) * 2,
        });
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Each layer shifts by a different amount, which is what reads as depth.
  const shift = (depth) => ({
    transform: `translate3d(${parallax.x * depth}px, ${parallax.y * depth}px, 0)`,
  });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* 2. Blurred light orbs */}
      <span
        className="mb-orb h-[26rem] w-[26rem] -left-32 -top-32"
        style={{ background: "radial-gradient(circle, rgba(43,134,245,0.30), transparent 68%)" }}
      />
      <span
        className="mb-orb h-[22rem] w-[22rem] -right-24 top-1/3"
        style={{
          background: "radial-gradient(circle, rgba(13,148,136,0.26), transparent 68%)",
          animationDelay: "-13s",
        }}
      />

      {/* 3. Light following the pointer */}
      <div className="mb-cursor-glow" />

      {/* 4. Medical crosses and a faint grid */}
      <svg className="absolute inset-0 h-full w-full" style={shift(6)}>
        <defs>
          <pattern id="mb-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M56 0H0V56" fill="none" stroke="rgb(29 111 224 / 0.06)" strokeWidth="1" />
            {/* A small cross at each intersection - the medical motif, whispered. */}
            <path
              d="M24 28h8M28 24v8"
              stroke="rgb(13 148 136 / 0.10)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </pattern>
          <radialGradient id="mb-fade" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="mb-mask">
            <rect width="100%" height="100%" fill="url(#mb-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#mb-grid)" mask="url(#mb-mask)" />
      </svg>

      {/* 5. Circuit traces */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
        style={shift(9)}
      >
        <g fill="none" stroke="rgb(29 111 224 / 0.28)" strokeWidth="1.2" strokeLinecap="round">
          {[
            "M-20 120 H180 l40 40 H420 l40 -40 H700 l50 50 H1220",
            "M-20 640 H240 l46 -46 H560 l40 40 H900 l40 -40 H1220",
            "M120 -20 V150 l40 40 V420 l-40 40 V820",
            "M1040 -20 V220 l-46 46 V520 l46 46 V820",
          ].map((d, i) => (
            <path key={i} d={d} className="mb-circuit" style={{ animationDelay: `${-i * 4}s` }} />
          ))}
          {/* Solder pads where the traces turn. */}
          {[[180, 120], [420, 120], [700, 120], [240, 640], [560, 594], [900, 634], [120, 150], [1040, 220]].map(
            ([cx, cy], i) => (
              <circle key={`p${i}`} cx={cx} cy={cy} r="3.5" fill="rgb(29 111 224 / 0.22)" stroke="none" />
            )
          )}
        </g>
      </svg>

      {/* 6. DNA strand */}
      <svg
        className="mb-dna absolute -right-10 top-10 h-[34rem] w-40"
        viewBox="0 0 120 520"
        fill="none"
        style={shift(12)}
      >
        <path
          d="M30 0 C90 65, 90 130, 30 195 C-30 260, -30 325, 30 390 C90 455, 90 520, 30 520"
          stroke="rgb(13 148 136 / 0.30)"
          strokeWidth="2.5"
        />
        <path
          d="M90 0 C30 65, 30 130, 90 195 C150 260, 150 325, 90 390 C30 455, 30 520, 90 520"
          stroke="rgb(43 134 245 / 0.30)"
          strokeWidth="2.5"
        />
        {Array.from({ length: 13 }, (_, i) => {
          const y = 20 + i * 38;
          const spread = Math.abs(Math.sin((i / 13) * Math.PI * 2)) * 26;
          return (
            <line
              key={y}
              x1={60 - spread}
              y1={y}
              x2={60 + spread}
              y2={y}
              stroke="rgb(43 134 245 / 0.35)"
              strokeWidth="1.5"
              style={{ animationDelay: `${-i}s` }}
            />
          );
        })}
      </svg>

      {/* 7. Connected nodes: secure, connected, decentralised */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={shift(14)}
      >
        {LINKS.map(([a, b], i) => (
          <line
            key={`l${i}`}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
            stroke="rgb(43 134 245 / 0.16)"
            strokeWidth="0.12"
            vectorEffect="non-scaling-stroke"
            className="mb-link"
            style={{ animationDelay: `${-(i % 6) * 1.3}s` }}
          />
        ))}
        {NODES.map(([x, y], i) => (
          <circle
            key={`n${i}`}
            cx={x}
            cy={y}
            r="0.55"
            className="mb-node"
            style={{ animationDelay: `${-(i % 5) * 1.7}s` }}
          />
        ))}
      </svg>

      {/* 8. ECG trace */}
      <svg
        className="absolute inset-x-0 top-[42%] h-40 w-full"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        style={shift(22)}
      >
        <defs>
          <linearGradient id="mb-ecg" x1="0" x2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity="0" />
            <stop offset="45%" stopColor="#0d9488" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#2b86f5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="mb-ecg"
          d="M0 80 H150 l18 0 l10 -26 l12 52 l12 -74 l14 96 l12 -48 l10 0 H520
             l18 0 l10 -20 l12 44 l12 -62 l14 80 l12 -42 l10 0 H900
             l18 0 l10 -26 l12 52 l12 -74 l14 96 l12 -48 l10 0 H1200"
          fill="none"
          stroke="url(#mb-ecg)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* 9a. Medical glyphs, drifting. Four, at very low opacity - present
              enough to register, faint enough never to compete with text. */}
      <div className="absolute inset-0" style={shift(18)}>
        {[
          { char: "✚", left: 12, top: 24, size: 30, delay: 0 },
          { char: "🛡", left: 78, top: 16, size: 26, delay: -6 },
          { char: "🔗", left: 24, top: 72, size: 24, delay: -11 },
          { char: "🧬", left: 66, top: 62, size: 28, delay: -16 },
        ].map((g) => (
          <span
            key={g.char}
            className="mb-glyph absolute select-none text-brand-600"
            style={{
              left: `${g.left}%`,
              top: `${g.top}%`,
              fontSize: g.size,
              animationDelay: `${g.delay}s`,
            }}
          >
            {g.char}
          </span>
        ))}
      </div>

      {/* 9b. Drifting motes: cells, records, nodes - whichever you prefer */}
      <div className="absolute inset-0" style={shift(30)}>
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="mb-mote absolute rounded-full"
            style={{
              left: `${m.left}%`,
              top: `${m.top}%`,
              width: m.size,
              height: m.size,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
