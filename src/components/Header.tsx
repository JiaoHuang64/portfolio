export default function Header() {
  return (
    <header className="mx-auto w-full max-w-5xl px-6 pt-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Abraham Yuan</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700">
              Biochemical Engineering (MEng) — Process automation, process modelling, and
              GMP-aligned bioprocess operations.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-700">
              <span className="rounded-full bg-zinc-50 px-3 py-1 ring-1 ring-zinc-200">
                MATLAB Simulink (PID)
              </span>
              <span className="rounded-full bg-zinc-50 px-3 py-1 ring-1 ring-zinc-200">
                AKTA / UNICORN
              </span>
              <span className="rounded-full bg-zinc-50 px-3 py-1 ring-1 ring-zinc-200">
                TFF (UF/DF)
              </span>
              <span className="rounded-full bg-zinc-50 px-3 py-1 ring-1 ring-zinc-200">
                DoE (JMP)
              </span>
              <span className="rounded-full bg-zinc-50 px-3 py-1 ring-1 ring-zinc-200">
                GMP documentation
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <a
              className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 no-underline"
              href="mailto:hengqixuan.yuan.22@ucl.ac.uk"
            >
              Email
            </a>

            <a
              className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 no-underline"
              href="https://github.com/JiaoHuang64"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>

            <a
              className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 no-underline"
              href="https://www.linkedin.com/in/abraham-yuan-a02631287/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>

            {/* ✅ 修正路径：必须小写 */}
            <a
              className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 no-underline"
              href="/cv/cv.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Download CV (PDF)
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}