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
    </main>
  );
}
