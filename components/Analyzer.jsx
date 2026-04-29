"use client";

import { useState } from "react";
import Loader from "./Loader";
import Result from "./Result";

export default function Analyzer() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!url) return;

    setLoading(true);
    setResult(null);

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="mx-auto mt-10 max-w-2xl">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-700 bg-gray-900 p-4 focus:outline-none"
          placeholder="Paste Shopify product URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <button
          onClick={analyze}
          className="rounded-lg bg-rose-600 px-6 font-semibold hover:bg-rose-700"
        >
          Analyze
        </button>
      </div>

      {loading && <Loader />}
      {result && <Result data={result} />}
    </div>
  );
}
