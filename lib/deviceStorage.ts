// Everything Blind Cellar keeps in this browser once Supabase is the source
// of truth: just the host token for sessions this device hosts, and the
// guest token for sessions this device has joined. Nothing else is mirrored
// locally — no session/wine/guess data lives here anymore.

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function hostTokenKey(publicId: string): string {
  return `blindCellar.hostToken.${publicId}`;
}

function guestTokenKey(publicId: string): string {
  return `blindCellar.guestToken.${publicId}`;
}

export function getHostToken(publicId: string): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(hostTokenKey(publicId));
}

export function setHostToken(publicId: string, token: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(hostTokenKey(publicId), token);
}

export function getGuestToken(publicId: string): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(guestTokenKey(publicId));
}

export function setGuestToken(publicId: string, token: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(guestTokenKey(publicId), token);
}
