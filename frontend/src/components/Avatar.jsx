/**
 * Someone's profile photo, or their initials if they have not set one.
 *
 * Used in the header, the doctor list, doctor profiles and chat, so it has to
 * be cheap: the image is fetched once per wallet and cached, and a person with
 * no photo is remembered as such rather than being requested again on every
 * render.
 */
import { useEffect, useState } from "react";

import { avatarUrl, initials, tintFor } from "../lib/avatar";

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-24 w-24 text-2xl",
};

export default function Avatar({ wallet, name = "", size = "md", className = "", ring = false }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!wallet) return undefined;

    avatarUrl(wallet).then((u) => {
      if (!cancelled) setUrl(u);
    });

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const box = `${SIZES[size] || SIZES.md} shrink-0 overflow-hidden rounded-full ${
    ring ? "ring-2 ring-white" : ""
  } ${className}`;

  if (url) {
    return <img src={url} alt="" className={`${box} object-cover`} />;
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} flex items-center justify-center font-bold ${tintFor(
        wallet || name
      )}`}
    >
      {initials(name)}
    </span>
  );
}
