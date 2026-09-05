"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 0: Client-side session helper for the new App Router routes.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The legacy SPA kept session in a Zustand store (persisted in localStorage).
// The new App Router routes are server-routable but most pages still need
// client-side data fetching (TanStack Query) and the JWT for API calls.
//
// This module is a thin wrapper that:
//   * reads the session JWT from the `sgtx-session` cookie OR localStorage
//     (the legacy SPA stored it in localStorage; the new /login route will
//     set the cookie)
//   * exposes the decoded payload (sub, tenantGtid, role, scope, exp)
//   * exposes a `fetchWithAuth` helper that attaches the JWT as a Bearer
//     header and the CSRF token (from the JWT `csrf` claim) for mutations
//   * exposes `signOut()` which clears the cookie + localStorage
//
// IMPORTANT: this is NOT the source of truth. The middleware is. The
// middleware re-verifies the JWT on every request and injects
// `x-tenant-gtid` / `x-employee-id` / `x-role` headers. This client helper
// is for client-side fetches only.

import { useEffect, useState } from "react";

interface SessionPayload {
  sub: string;
  email?: string;
  tenantGtid?: string;
  role?: string;
  mfaVerified?: boolean;
  csrf?: string;
  scope?: string[];
  exp?: number;
}

interface SessionState {
  token: string | null;
  payload: SessionPayload | null;
  ready: boolean; // false during the first render (cookie not yet read)
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function decodeJwt(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

// Singleton state shared across hooks.
let _state: SessionState = { token: null, payload: null, ready: false };
const _listeners = new Set<() => void>();

function notify() {
  for (const l of _listeners) l();
}

function setState(s: SessionState) {
  _state = s;
  notify();
}

function refreshFromStorage(): void {
  if (typeof document === "undefined") return;
  const cookieToken = getCookie("sgtx-session");
  const lsToken =
    typeof window !== "undefined"
      ? window.localStorage.getItem("sgtx-session-token")
      : null;
  const token = cookieToken || lsToken;
  if (!token) {
    setState({ token: null, payload: null, ready: true });
    return;
  }
  const payload = decodeJwt(token);
  if (!payload) {
    setState({ token: null, payload: null, ready: true });
    return;
  }
  if (payload.exp && Date.now() > payload.exp * 1000) {
    clearCookie("sgtx-session");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("sgtx-session-token");
    }
    setState({ token: null, payload: null, ready: true });
    return;
  }
  setState({ token, payload, ready: true });
}

if (typeof window !== "undefined") {
  Promise.resolve().then(refreshFromStorage);
}

export function setSession(token: string, maxAgeSeconds = 60 * 60): void {
  setCookie("sgtx-session", token, maxAgeSeconds);
  if (typeof window !== "undefined") {
    window.localStorage.setItem("sgtx-session-token", token);
  }
  const payload = decodeJwt(token);
  setState({ token, payload, ready: true });
}

export function signOut(): void {
  clearCookie("sgtx-session");
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("sgtx-session-token");
  }
  setState({ token: null, payload: null, ready: true });
}

export function useSession(): SessionState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    _listeners.add(l);
    refreshFromStorage();
    return () => {
      _listeners.delete(l);
    };
  }, []);
  return _state;
}

export function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = _state.token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = (init.method || "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (isMutation && _state.payload?.csrf) {
    headers.set("X-CSRF-Token", _state.payload.csrf);
  }
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}

export const refreshSession = refreshFromStorage;

export function useRequireAuth(): { ready: boolean; authenticated: boolean } {
  const { ready, token } = useSession();
  useEffect(() => {
    if (ready && !token && typeof window !== "undefined") {
      const dest = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(dest)}`;
    }
  }, [ready, token]);
  return { ready, authenticated: !!token };
}
