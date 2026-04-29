export default function Result({ data }) {
  return (
    <div className="mt-10 space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-2 text-lg font-semibold text-gray-400">Current Headline</h2>
        <p>{data.currentHeadline}</p>
      </div>

      <div className="rounded-xl border border-green-700 bg-green-900/20 p-5">
        <h2 className="mb-2 text-lg font-semibold text-green-400">Improved Version</h2>
        <p className="mb-3">{data.newHeadline}</p>
        <p className="mb-2 text-blue-400">CTA: {data.cta}</p>
        <p className="text-yellow-400">Trust Fix: {data.trust}</p>
      </div>
    </div>
  );
}
