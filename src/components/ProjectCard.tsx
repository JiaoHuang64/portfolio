"use client";

import type { Project } from "@/data/projects";

export default function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (p: Project) => void;
}) {
  return (
    <button
      className="group w-full rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
      onClick={() => onOpen(project)}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{project.title}</h3>

          {project.subtitle && (
            <p className="mt-1 text-sm text-zinc-600">
              {project.subtitle}
            </p>
          )}
        </div>

        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
          View
        </span>
      </div>

      <p className="mt-4 text-sm text-zinc-700">
        {project.oneLiner}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.tags.map((t, i) => (
          <span
            key={`${project.id}-${t}-${i}`}
            className="rounded-full bg-zinc-50 px-3 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        {project.role} • {project.period}
      </div>
    </button>
  );
}