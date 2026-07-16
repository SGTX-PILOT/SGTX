"use client";

// SGTX Address Autocomplete Input (FIX-AUTH-COUNTRIES-KYC / Fix 7)
//
// Reusable debounced address autocomplete that fetches from
//   /api/sgtx/address/autocomplete?country={country}&query={address}
// and shows a dropdown of { postal, city, region } suggestions. On select
// it calls onPick with the chosen suggestion so the parent can fill the
// street / city / postal-code fields.
//
// Also exports <DetectLocationButton> which uses the browser Geolocation API
// to fetch lat/lng, then calls /api/sgtx/address/verify?lat=&lng= to
// reverse-geocode and pre-fill country + address.

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, Search, Crosshair, CheckCircle2 } from "lucide-react";

/** Shape returned by /api/sgtx/address/autocomplete — see postal-bank-data.ts. */
export interface AddressSuggestion {
  postal?: string;
  city?: string;
  region?: string;
  country?: string;
  /** Free-form label for display in the dropdown. */
  label?: string;
}

interface AddressAutocompleteInputProps {
  /** Current input value (controlled). */
  value: string;
  /** Change handler for the raw input text. */
  onChange: (v: string) => void;
  /** ISO alpha-2 country code (drives the country filter). */
  country: string;
  /**
   * Called when the user picks a suggestion from the dropdown. The parent
   * typically splits this into street / city / postal-code fields.
   */
  onPick: (s: AddressSuggestion) => void;
  /** Placeholder text. */
  placeholder?: string;
  /** Optional id for label association. */
  id?: string;
  /** Disabled state. */
  disabled?: boolean;
}

/**
 * Debounced address autocomplete input with a dropdown of suggestions.
 * Fetches from `/api/sgtx/address/autocomplete` with 300ms debounce.
 */
export function AddressAutocompleteInput({
  value,
  onChange,
  country,
  onPick,
  placeholder = "Start typing the address…",
  id,
  disabled,
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Debounced fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.length < 2 || !country) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      // Cancel any in-flight request.
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const url = `/api/sgtx/address/autocomplete?country=${encodeURIComponent(country)}&query=${encodeURIComponent(value)}`;
        const r = await fetch(url, { signal: abortRef.current.signal });
        if (!r.ok) { setSuggestions([]); return; }
        const data = await r.json() as { results?: any[] };
        const mapped: AddressSuggestion[] = (data.results || []).map((r: any) => ({
          postal: r.postal,
          city: r.city,
          region: r.region,
          country: r.country,
          label: [r.postal, r.city, r.region].filter(Boolean).join(", "),
        }));
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
        setActiveIdx(-1);
      } catch (e: any) {
        if (e?.name !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, country]);

  // Close dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = useCallback((s: AddressSuggestion) => {
    onPick(s);
    setOpen(false);
    setActiveIdx(-1);
  }, [onPick]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pick(suggestions[activeIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className="relative" ref={containerRef}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm disabled:opacity-50"
        autoComplete="street-address"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      {!loading && value && <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={`${s.postal || ""}-${s.city || ""}-${i}`}
              type="button"
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => pick(s)}
              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-muted/60 ${i === activeIdx ? "bg-primary/10" : ""}`}
            >
              <span className="flex items-center gap-2">
                <MapPin className="w-3 h-3 text-muted-foreground" />
                <span>{s.label || [s.postal, s.city].filter(Boolean).join(", ")}</span>
              </span>
              {i === activeIdx && <CheckCircle2 className="w-3 h-3 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface DetectLocationButtonProps {
  /**
   * Called with the reverse-geocoded address components. The parent typically
   * sets the country + street fields.
   */
  onDetect: (result: {
    country?: string;
    address?: string;
    city?: string;
    postal?: string;
    lat?: number;
    lng?: number;
  }) => void;
  /** Optional className override. */
  className?: string;
  /** Label text. */
  label?: string;
}

/**
 * "Detect my location" button — uses the browser Geolocation API to fetch
 * lat/lng, then calls /api/sgtx/address/verify?lat=&lng= to reverse-geocode.
 * Calls onDetect with the resolved address components.
 */
export function DetectLocationButton({ onDetect, className, label = "Detect my location" }: DetectLocationButtonProps) {
  const [state, setState] = useState<"idle" | "locating" | "geocoding" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErrorMsg("Geolocation not supported by this browser");
      setState("error");
      return;
    }
    setState("locating");
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setState("geocoding");
        try {
          const url = `/api/sgtx/address/verify?lat=${latitude}&lng=${longitude}`;
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Reverse geocode failed: ${r.status}`);
          const data = await r.json() as {
            country?: string;
            street?: string;
            city?: string;
            postal?: string;
            formatted?: string;
          };
          onDetect({
            country: data.country,
            address: data.street || data.formatted,
            city: data.city,
            postal: data.postal,
            lat: latitude,
            lng: longitude,
          });
          setState("idle");
        } catch (e: any) {
          setErrorMsg(e?.message || "Reverse geocode failed");
          setState("error");
        }
      },
      (err) => {
        setErrorMsg(err.message || "Geolocation denied");
        setState("error");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [onDetect]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-[0.7rem] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ${className || ""}`}
      title={errorMsg || "Use browser location to pre-fill the address"}
    >
      {state === "locating" || state === "geocoding" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Crosshair className="w-3 h-3" />
      )}
      <span>{state === "locating" ? "Locating…" : state === "geocoding" ? "Resolving…" : label}</span>
      {errorMsg && <span className="text-destructive">— {errorMsg}</span>}
    </button>
  );
}
