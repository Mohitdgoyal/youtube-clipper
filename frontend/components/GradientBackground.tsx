/** Static CSS atmosphere — coral/amber studio wash in light; uniform solid in dark */
export function GradientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Light-only wash; dark uses flat body --background */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            "radial-gradient(120% 70% at 50% -10%, oklch(0.96 0.03 250) 0%, transparent 55%), radial-gradient(90% 55% at 50% 110%, oklch(0.72 0.16 28 / 0.35) 0%, oklch(0.8 0.1 70 / 0.18) 35%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay dark:hidden"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
