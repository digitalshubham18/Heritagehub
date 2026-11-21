"use client";
import { LostFoundBoard } from "@/components/lost-found-board";

export default function AdminLostFound() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">Lost and found</h1><p className="mt-1 text-sm text-ink/70">Everything logged at your sites. Staff handle returns at the desk; this view is for oversight and the CSV export.</p></div>
      <LostFoundBoard />
    </div>
  );
}
