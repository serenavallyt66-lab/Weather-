import Analyzer from "@/components/Analyzer";
import Hero from "@/components/Hero";

export default function Home() {
  return (
    <main className="min-h-screen bg-black px-6 pb-20 text-white">
      <Hero />
      <Analyzer />
    </main>
  );
}
