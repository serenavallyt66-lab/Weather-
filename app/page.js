import ResultCard from "@/components/ResultCard";

export default function Page() {
  const result = null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-start justify-center px-4 py-12">
      <ResultCard result={result} />
    </main>
  );
}
