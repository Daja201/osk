import { qrModules, qrPath } from "@/lib/ui/qr";

// QR kód jako SVG. Vždy tmavé čtverečky na bílém (s okrajem 4 čtverečky), jinak ho telefon nenačte.
// Jako <g> se dá vložit přímo do grafu (x, y, size v pixelech grafu), jinak samostatné <svg>.
export default function QrCode({
  text,
  size,
  x,
  y,
  inline = false,
  className,
}: {
  text: string;
  size: number;
  x?: number;
  y?: number;
  inline?: boolean;
  className?: string;
}) {
  const modules = qrModules(text);
  const total = modules.length + 8; // okraj 4 + kód + okraj 4
  const content = (
    <>
      <rect width={total} height={total} rx="2" fill="#FFFFFF" />
      <path d={qrPath(modules)} transform="translate(4 4)" fill="#14243A" shapeRendering="crispEdges" />
    </>
  );
  if (inline) {
    return (
      <g transform={`translate(${x ?? 0} ${y ?? 0}) scale(${size / total})`} aria-hidden="true">
        {content}
      </g>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${total} ${total}`} width={size} height={size} role="img" aria-label={`QR kód: ${text}`} className={className}>
      {content}
    </svg>
  );
}
