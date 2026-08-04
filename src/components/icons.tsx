import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function RadarIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 12 18 6M12 2v2M22 12h-2M12 22v-2M2 12h2"/></svg>;
}

export function FieldIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M12 22V9M12 13C7.5 13 5 11 5 7c4.5 0 7 2 7 6ZM12 17c4.5 0 7-2 7-6-4.5 0-7 2-7 6ZM5 22h14"/></svg>;
}

export function PlusIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M12 5v14M5 12h14"/></svg>;
}

export function MessageIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></svg>;
}

export function ChevronIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="m9 18 6-6-6-6"/></svg>;
}

export function CloseIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M18 6 6 18M6 6l12 12"/></svg>;
}

export function SeedIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M18.5 4.5C13 4.5 7 7 5 12.5c-1.2 3.5.8 6 4 6 5.5 0 9-6 9.5-14Z"/><path d="M6 18c2.5-4 5.5-6.5 9.5-9"/></svg>;
}

export function LocationIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
}

export function SproutIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M12 22V10M12 14C7.5 14 5 12 5 8c4.5 0 7 2 7 6ZM12 17c4.5 0 7-2 7-6-4.5 0-7 2-7 6Z"/></svg>;
}

export function MoonIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M20.5 14.2A8.4 8.4 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>;
}

export function SunIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
}

export function CheckIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="m5 12 4 4L19 6"/></svg>;
}
