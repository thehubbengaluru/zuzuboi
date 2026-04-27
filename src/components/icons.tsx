import { SVGProps } from "react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round"
} as const;

export function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}

export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      <path d="M4 12 21 4l-8 17-2.4-7.4L4 12z" />
    </svg>
  );
}

export function VolumeOnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      <path d="M4 9h3l4-3v12l-4-3H4z" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M19 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function VolumeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      <path d="M4 9h3l4-3v12l-4-3H4z" />
      <line x1="16" y1="8" x2="22" y2="14" />
      <line x1="22" y1="8" x2="16" y2="14" />
    </svg>
  );
}

export function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
      <path d="M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
