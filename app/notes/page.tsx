import { NotesList } from "@/components/notes-list";

export default function NotesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-medium">Notes</h1>
        <a
          href="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to capture
        </a>
      </div>
      <NotesList />
    </main>
  );
}
