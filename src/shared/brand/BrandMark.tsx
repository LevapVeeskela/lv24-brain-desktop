import type { SVGProps } from "react";
import mark from "./mark.json";

/** The same geometry is read by scripts/generate-icons.ps1. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox={`0 0 ${mark.viewBox} ${mark.viewBox}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth={mark.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mark.paths.map((points, index) => (
          <polyline key={index} points={points.map((point) => point.join(",")).join(" ")} />
        ))}
      </g>
      <g fill="currentColor">
        {mark.nodes.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={mark.nodeRadius} />
        ))}
      </g>
    </svg>
  );
}
