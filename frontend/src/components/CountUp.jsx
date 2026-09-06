/**
 * A number that counts up to its real value when the dashboard loads.
 *
 * The value shown is always the one it was given - this animates the way a
 * true figure arrives, it never invents one. It also lands exactly on the
 * target rather than easing towards it and stopping a digit short.
 *
 * For anyone who prefers reduced motion, the number simply appears.
 */
import { useEffect, useRef, useState } from "react";

const DURATION = 900;

export default function CountUp({ value, className = "" }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const still =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (still || target === from.current) {
      setShown(target);
      from.current = target;
      return undefined;
    }

    const start = performance.now();
    const begin = from.current;
    let frame = 0;

    const step = (now) => {
      const p = Math.min(1, (now - start) / DURATION);
      // Ease-out cubic: quick at first, settling gently.
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(begin + (target - begin) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return <span className={`tabular-nums ${className}`}>{shown}</span>;
}
