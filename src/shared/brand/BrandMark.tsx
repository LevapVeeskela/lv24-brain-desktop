import { useId, type SVGProps } from "react";
import mark from "./mark.json";

/** The same geometry is read by scripts/generate-icons.ps1. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  const maskId = useId();
  return (
    <svg
      viewBox={`0 0 ${mark.viewBox} ${mark.viewBox}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <mask id={maskId} className="brand-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={mark.viewBox} height={mark.viewBox}>
          <rect width={mark.viewBox} height={mark.viewBox} fill="white" />
          <g fill="none" stroke="black" strokeWidth={mark.cutoutWidth} strokeLinecap="round" strokeLinejoin="round">
            {mark.cutouts.map((path) => <path key={path} d={path} />)}
          </g>
        </mask>
      </defs>
      <g fill="currentColor" mask={`url(#${maskId})`}>
        {mark.silhouettes.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
    </svg>
  );
}
