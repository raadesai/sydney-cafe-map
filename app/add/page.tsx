import type { Metadata } from "next";
import Link from "next/link";
import { AddPlaceForm } from "@/components/add-place-form";

export const metadata: Metadata = {
  title: "Add a place — Sydney Cafe Map",
  description: "Add a cafe or restaurant to the map from a Google Maps link.",
};

export default function AddPage() {
  return (
    <main className="min-h-dvh bg-[#1C1512] text-[#F7F2EA]">
      <div className="max-w-md mx-auto px-6 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-[#F7F2EA]/50 hover:text-[#B8834A] mb-6"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
          Back to map
        </Link>

        <h1 className="text-[22px] font-bold tracking-[0.02em] mb-1">
          Add a <span className="text-[#B8834A]">place</span>
        </h1>
        <p className="text-[13px] text-[#F7F2EA]/45 mb-7">
          Paste a Google Maps link and it goes live on the map in a couple of minutes.
        </p>

        <AddPlaceForm />
      </div>
    </main>
  );
}
