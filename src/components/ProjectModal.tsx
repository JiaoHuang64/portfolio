"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Project } from "@/data/projects";

export default function ProjectModal({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
}) {
  return (
    <AnimatePresence>
      {open && project ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl"
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">{project.title}</h3>

                {project.subtitle && (
                  <p className="mt-1 text-sm text-zinc-600">{project.subtitle}</p>
                )}

                <p className="mt-2 text-xs text-zinc-500">
                  {project.role} • {project.period}
                </p>

                <p className="mt-1 text-xs text-zinc-500">{project.org}</p>
              </div>

              <button
                className="rounded-xl border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50"
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-6">
              <div>
                <p className="text-sm font-medium">Summary</p>
                <p className="mt-2 text-sm text-zinc-700">{project.oneLiner}</p>
              </div>

              <div>
                <p className="text-sm font-medium">Key work</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                  {project.bullets.map((x, i) => (
                    <li key={`${project.id}-b-${i}`}>{x}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-sm font-medium">Tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {project.tags.map((t, i) => (
                    <span
                      key={`${project.id}-t-${t}-${i}`}
                      className="rounded-full bg-zinc-50 px-3 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs text-zinc-500">
                  Note: keep content factual; avoid confidential details. For Roche items, summarise
                  method-level contributions only.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}