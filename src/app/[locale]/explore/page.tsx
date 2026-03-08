import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ExploreGrid } from "@/components/explore/explore-grid";
import { StoriesBar } from "@/components/stories/stories-bar";

export default function ExplorePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <StoriesBar />
        <ExploreGrid />
      </main>
      <Footer />
    </div>
  );
}
