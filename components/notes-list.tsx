"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type NoteRow = {
  id: number;
  content: string;
  createdAt: string;
  tags: string[];
};

export function NotesList() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/notes${params}`);
      const data = await res.json();
      setNotes(data.notes);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchNotes(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, fetchNotes]);

  function formatDate(iso: string): string {
    const d = new Date(iso + "Z");
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search notes\u2026"
        aria-label="Search notes"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query ? "No notes match that search." : "No notes yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded border border-border px-4 py-3"
            >
              <p className="text-sm leading-relaxed">{note.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {notes.length} {notes.length === 1 ? "note" : "notes"}
      </p>
    </div>
  );
}
