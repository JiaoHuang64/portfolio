"use client";

import { useMemo, useState } from "react";
import Header from "@/components/Header";
import Section from "@/components/Section";
import ProjectCard from "@/components/ProjectCard";
import ProjectModal from "@/components/ProjectModal";
import { projects, type Project } from "@/data/projects";

export default function Home() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);

  const items = useMemo(() => projects, []);

  return (
    <main className="min-h-screen">
      <Header />

      {/* ================= Projects ================= */}

      <Section
        title="Projects"
        subtitle="Selected academic and industrial work. Click a card to view technical details."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={(proj) => {
                setSelected(proj);
                setOpen(true);
              }}
            />
          ))}
        </div>
      </Section>

      {/* ================= How I Work ================= */}

      <Section
        title="How I work"
        subtitle="My approach is structured, careful, and based on things that can be checked."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 p-5">
            <p className="text-sm font-semibold">Data before assumption</p>
            <p className="mt-2 text-sm text-zinc-700">
              I try to support decisions with measured results. I prefer recorded parameters,
              test runs, and written protocols over informal adjustments.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 p-5">
            <p className="text-sm font-semibold">Work step by step</p>
            <p className="mt-2 text-sm text-zinc-700">
              I usually split problems into smaller steps and verify each one. When possible,
              I use modelling or DoE to guide optimisation.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 p-5">
            <p className="text-sm font-semibold">Keep records clear</p>
            <p className="mt-2 text-sm text-zinc-700">
              I maintain clear experiment notes and change records. If results change,
              I first trace the cause instead of patching the output.
            </p>
          </div>
        </div>
      </Section>

      {/* ================= Footer ================= */}

      <footer className="mx-auto w-full max-w-5xl px-6 pb-14 text-xs text-zinc-500">
        © {new Date().getFullYear()} Abraham Yuan. Built with Next.js.
      </footer>

      <ProjectModal open={open} onClose={() => setOpen(false)} project={selected} />
    </main>
  );
}