/**
 * Skip to main content link - visible on keyboard focus
 * Allows keyboard users to bypass navigation and jump directly to main content
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent-indigo focus:text-white focus:rounded-lg focus:shadow-panel focus:font-medium focus:text-sm"
    >
      Skip to main content
    </a>
  );
}
