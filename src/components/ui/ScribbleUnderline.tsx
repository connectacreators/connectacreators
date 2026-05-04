import { ReactNode } from "react";

export function ScribbleUnderline({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        aria-hidden="true"
        className="absolute left-0 -bottom-1 w-full pointer-events-none opacity-0 group-hover:opacity-100"
        style={{ height: 7, overflow: "visible" }}
        viewBox="0 0 100 7"
        preserveAspectRatio="none"
      >
        <path
          className="scribble-path"
          d="M0,4 C12,2 25,6 40,3.5 C55,1 70,5.5 85,3 C92,1.5 97,4 100,3.5"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
