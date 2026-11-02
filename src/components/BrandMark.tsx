/**
 * Bird's Eye mark: an eye whose upper lid is a bird's wings in flight.
 * Original artwork; no team or network marks.
 */
export function BrandMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="15" fill="#004c54" />
      <path d="M9 33 C 15 23, 23 20, 32 29 C 41 20, 49 23, 55 33" fill="none" stroke="#ffffff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 36 C 22 46, 42 46, 50 36" fill="none" stroke="#a5acaf" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="32" cy="37" r="5.2" fill="#ffffff" />
    </svg>
  );
}
