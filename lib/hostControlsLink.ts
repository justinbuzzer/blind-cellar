/** Builds the host control page URL for a session, matching the route pattern /host/[publicId]?token=... */
export function buildHostControlsHref(sessionPublicId: string, hostToken: string): string {
  return `/host/${sessionPublicId}?token=${encodeURIComponent(hostToken)}`;
}
