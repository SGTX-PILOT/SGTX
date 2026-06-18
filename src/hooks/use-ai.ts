"use client";

import { useState, useCallback } from "react";

interface AIResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  authority: string;
  [key: string]: any;
}

interface AIState<T = AIResult> {
  data: T | null;
  loading: boolean;
  error: string | null;
  run: (body?: any) => Promise<T | null>;
  reset: () => void;
}

/**
 * useAI — React hook for calling SGTX AI API routes with loading/error state.
 * @param endpoint e.g. "/api/sgtx/ai/inbox-summary"
 * @param immediateBody if provided, fires on mount
 */
export function useAI<T = AIResult>(endpoint: string, immediateBody?: any): AIState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (body?: any): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? immediateBody ?? {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      return json;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint, immediateBody]);

  const reset = useCallback(() => { setData(null); setError(null); setLoading(false); }, []);

  return { data, loading, error, run, reset };
}
