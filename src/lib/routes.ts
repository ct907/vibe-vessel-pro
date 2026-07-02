/** Every route other than "/app" renders as a full-screen overlay on top of the always-mounted editor. */
export function isOverlayRoute(pathname: string): boolean {
  return pathname !== "/app";
}
