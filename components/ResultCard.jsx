/**
 * @typedef {Object} Result
 * @property {string} currentHeadline
 * @property {string} newHeadline
 * @property {string} cta
 * @property {string} trust
 */

/**
 * @param {{ result?: Result | null, isLoading?: boolean, error?: string | null }} props
 */
export default function ResultCard({ result, isLoading = false, error = null }) {
  if (isLoading) {
    return (
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-8 w-full rounded bg-slate-200" />
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-8 w-full rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-200" />
          <div className="h-8 w-4/5 rounded bg-slate-200" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="w-full rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide">Something went wrong</p>
        <p className="mt-2 text-base">{error}</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">No result yet</p>
        <p className="mt-2 text-base text-slate-600">
          Generate a result to see your updated headline, CTA, and trust messaging here.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current headline</h2>
        <p className="text-lg font-semibold text-slate-800">{result.currentHeadline}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">New headline</h2>
        <p className="text-xl font-bold text-slate-900">{result.newHeadline}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">CTA</h2>
        <p className="text-lg font-medium text-slate-800">{result.cta}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trust</h2>
        <p className="text-base text-slate-700">{result.trust}</p>
      </div>
    </section>
  );
}
