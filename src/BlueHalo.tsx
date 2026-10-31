export type GlowMode = 'waiting' | 'active' | 'paused' | 'error';

export default function BlueHalo({ mode = 'waiting' }: { mode?: GlowMode }) {
  return (
    <div
      data-spd-blue-halo
      data-spd-state={mode}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 90,
        opacity: { waiting: .35, active: .85, paused: .2, error: .55 }[mode],
        transition: 'opacity 160ms ease-out',
        background: [
          "linear-gradient(to bottom, rgba(71,145,255,.22), transparent 30px)",
          "linear-gradient(to top, rgba(71,145,255,.22), transparent 30px)",
          "linear-gradient(to right, rgba(71,145,255,.22), transparent 30px)",
          "linear-gradient(to left, rgba(71,145,255,.22), transparent 30px)",
        ].join(","),
        boxShadow: "inset 0 0 24px -14px rgba(103,214,255,.75)",
      }}
    />
  );
}
