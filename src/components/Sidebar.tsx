import { History, Route, ScanSearch, Share2 } from 'lucide-react';

export type ViewKey = 'diagnose' | 'graph' | 'path' | 'history';

const items: { key: ViewKey; label: string; icon: typeof ScanSearch }[] = [
  { key: 'diagnose', label: '智能诊断', icon: ScanSearch },
  { key: 'graph', label: '知识图谱', icon: Share2 },
  { key: 'path', label: '学习路径', icon: Route },
  { key: 'history', label: '历史记录', icon: History },
];

export default function Sidebar({
  active,
  onChange,
}: {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-line bg-panel/40 py-4 md:w-48 md:items-stretch md:px-3">
      {items.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`group relative flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 md:justify-start ${
              isActive
                ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-400/10 text-white shadow-glow'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-300 to-violet-400" />
            )}
            <Icon
              className={`h-5 w-5 shrink-0 ${isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'}`}
              strokeWidth={2}
            />
            <span className="hidden text-sm font-medium md:block">{label}</span>
          </button>
        );
      })}

      <div className="mt-auto hidden px-2 md:block">
        <div className="rounded-xl border border-line bg-slate-900/50 p-3 text-[11px] leading-relaxed text-slate-500">
          <span className="text-slate-300">侦探提示</span>
          <br />
          选题作答 → 提交错答 → 定位漏洞 → 追问验证
        </div>
      </div>
    </nav>
  );
}
