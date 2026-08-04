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

export function HomeIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>;
}

export function FieldIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="M12 22V9"/><path d="M12 13c-4.5 0-7-2-7-6 4.5 0 7 2 7 6Z"/><path d="M12 17c4.5 0 7-2 7-6-4.5 0-7 2-7 6Z"/><path d="M5 22h14"/></svg>;
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

export function SparkIcon(props: IconProps) {
  return <svg {...baseProps} {...props}><path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/></svg>;
}
