import { OmniBar } from "@/components/omni-bar";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <OmniBar />
      <nav className="fixed bottom-6">
        <a
          href="/notes"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Browse notes
        </a>
      </nav>
    </main>
  );
}
