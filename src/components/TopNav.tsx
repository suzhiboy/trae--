import { Radar, Sparkles } from 'lucide-react';

export default function TopNav({ demoActive }: { demoActive: boolean }) {
  return (
    <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-line bg-panel/60 px-5 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-glow">
          <Radar className="h-5 w-5 text-white" strokeWidth={2.2} />
          <span className="absolute inset-0 rounded-xl animate-pulse-ring" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-lg font-bold tracking-wide text-white">
            知隙
            <span className="ml-2 bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">
              Knowledge Detective
            </span>
          </div>
          <div className="text-[11px] tracking-[0.3em] text-slate-500">AI 知识漏洞侦探</div>
        </div>
      </div>

      {/* 右侧状态 */}
      <div className="flex items-center gap-4">
        <span className="hidden text-sm font-medium text-slate-400 md:block">知识诊断中心</span>
        <div
          className={`chip ${
            demoActive
              ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
              : 'border-slate-600/50 bg-slate-800/50 text-slate-400'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              demoActive ? 'animate-pulse bg-cyan-300' : 'bg-slate-500'
            }`}
          />
          {demoActive ? '演示模式 · 运行中' : '演示模式 · 待机'}
        </div>
        <div className="chip hidden border-violet-400/30 bg-violet-400/10 text-violet-300 sm:inline-flex">
          <Sparkles className="h-3 w-3" />
          Hackathon Build
        </div>
      </div>
    </header>
  );
}
