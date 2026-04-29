'use client';

import { useRef, useState } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(null);

  const analyze = async () => {
    if (!input.trim()) {
      setError('Please enter text to analyze.');
      setResult('');
      return;
    }

    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    setIsLoading(true);
    setError('');
    setResult('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = `Request failed with status ${res.status}`;

        try {
          const errPayload = await res.json();
          if (errPayload?.error) {
            message = errPayload.error;
          }
        } catch {
          // Ignore body parsing errors and keep fallback message.
        }

        throw new Error(message);
      }

      const data = await res.json();
      setResult(data?.result ?? 'No result returned.');
    } catch (err) {
      if (err?.name === 'AbortError') {
        setError('The request timed out. Please try again.');
      } else {
        setError(err?.message || 'An unexpected error occurred.');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <main>
      <h1>Weather Analyzer</h1>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste weather data here"
      />
      <button onClick={analyze} disabled={isLoading}>
        {isLoading ? 'Analyzing...' : 'Analyze'}
      </button>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && <pre>{result}</pre>}
"use client";

import { useMemo, useState } from "react";

const APPROVED_CUSTOM_DOMAINS = ["shop.example.com"];

function isValidShopifyProductUrl(input) {
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    const hasShopifyHostname = hostname.endsWith(".myshopify.com");
    const hasApprovedCustomDomain = APPROVED_CUSTOM_DOMAINS.includes(hostname);
    const isProductPath = /^\/products\//.test(parsed.pathname);

    return (hasShopifyHostname || hasApprovedCustomDomain) && isProductPath;
  } catch {
    return false;
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const urlError = useMemo(() => {
    if (!url.trim()) return "";

    try {
      // Validates URL format first.
      new URL(url);
    } catch {
      return "Please enter a valid URL.";
    }

    if (!isValidShopifyProductUrl(url)) {
      return "Please enter a valid Shopify product URL.";
    }

    return "";
  }, [url]);

  async function handleAnalyze(e) {
    e.preventDefault();
    setResult(null);
    setError("");

    if (urlError) {
      setError(urlError);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Analyze failed");
      }

      setResult(data);
    } catch (err) {
      setError(err.message || "Analyze failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Shopify Product Analyzer</h1>
      <form onSubmit={handleAnalyze}>
        <label htmlFor="product-url">Product URL</label>
        <input
          id="product-url"
          name="product-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://store.myshopify.com/products/example"
          aria-invalid={Boolean(urlError)}
          aria-describedby={urlError ? "url-error" : undefined}
        />

        {urlError ? (
          <p id="url-error" style={{ color: "crimson" }}>
            {urlError}
          </p>
        ) : null}

        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

        <button type="submit" disabled={loading || Boolean(urlError)}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </form>

      {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
    </main>
  );
}
