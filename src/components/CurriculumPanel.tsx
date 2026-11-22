import { GraduationCap, Shapes } from 'lucide-react';
import { gradeLevels, hsModules } from '../data/highSchool';
import { MathTex } from './MathTex';

/** 首页顶部：年级标识 + 高中知识模块总览 */
export default function CurriculumPanel() {
  return (
    <div className="flex flex-col gap-4">
      {/* 年级标识 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {gradeLevels.map((g) => (
          <div
            key={g.id}
            className={`glass relative overflow-hidden bg-gradient-to-br p-4 ${g.accent.split(' ').slice(0, 2).join(' ')}`}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-slate-900/60 ${g.accent.split(' ').slice(3).join(' ')}`}
              >
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-lg font-extrabold text-white">{g.name}</span>
                  <span className="truncate text-[11px] text-slate-400">{g.stage}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{g.focus}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {g.modules.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-slate-600/40 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-300"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 知识模块 */}
      <div className="glass relative overflow-hidden p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
        <div className="section-title mb-3">
          <Shapes className="h-4 w-4 text-cyan-300" />
          高中数学知识模块
          <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-slate-500">
            覆盖 6 大核心模块 · 点击图谱节点可查看复习建议
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {hsModules.map((m) => (
            <div
              key={m.id}
              className="group rounded-xl border border-line bg-slate-900/40 px-3.5 py-3 transition-all duration-200 hover:border-cyan-400/40 hover:shadow-glow"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-bold text-white group-hover:text-cyan-200">
                  {m.name}
                </span>
                <span className="chip border-slate-600/40 bg-slate-800/60 px-1.5 text-[10px] text-slate-400">
                  {m.grade}
                </span>
              </div>
              <p className="mb-1.5 line-clamp-1 text-[11px] text-slate-500">{m.desc}</p>
              <div className="overflow-x-auto rounded-lg bg-slate-950/60 px-2 py-1 text-cyan-200/90">
                <MathTex tex={m.formula} className="text-[13px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
