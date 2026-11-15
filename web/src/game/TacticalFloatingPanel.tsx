import { useRef, useState, type ReactNode } from "react";

/** Windows can be moved away from troops without changing the battlefield layout. */
export function TacticalFloatingPanel({
  title,
  className,
  onClose,
  children,
}: {
  title: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);
  return (
    <aside
      ref={panel}
      className={`tactical-float ${className}`}
      aria-label={title}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <header
        className="tactical-float-heading"
        title="拖动标题移动窗口"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button") || !panel.current)
            return;
          const rect = panel.current.getBoundingClientRect();
          const parent = panel.current.parentElement!.getBoundingClientRect();
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            startX: offset.x,
            startY: offset.y,
            minX: offset.x + parent.left - rect.left,
            maxX: offset.x + parent.right - rect.right,
            minY: offset.y + parent.top - rect.top,
            maxY: offset.y + parent.bottom - rect.bottom,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          setOffset({
            x: Math.max(
              current.minX,
              Math.min(
                current.maxX,
                current.startX + event.clientX - current.x,
              ),
            ),
            y: Math.max(
              current.minY,
              Math.min(
                current.maxY,
                current.startY + event.clientY - current.y,
              ),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <strong>{title}</strong>
        <button type="button" onClick={onClose} aria-label={`关闭${title}`}>
          ×
        </button>
      </header>
      {children}
    </aside>
  );
}
