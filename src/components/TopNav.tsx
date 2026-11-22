import { History, Network, Route, ScanSearch } from 'lucide-react';

export type ViewKey = 'diagnose' | 'graph' | 'path' | 'history';

const items: { key: ViewKey; label: string; shortLabel: string; icon: typeof ScanSearch }[] = [
  { key: 'diagnose', label: '诊断', shortLabel: '诊断', icon: ScanSearch },
  { key: 'graph', label: '知识图谱', shortLabel: '图谱', icon: Network },
  { key: 'path', label: '学习路径', shortLabel: '路径', icon: Route },
  { key: 'history', label: '历史记录', shortLabel: '历史', icon: History },
];

export default function TopNav({
  active,
  onChange,
  demoActive,
}: {
  active: ViewKey;
  onChange: (view: ViewKey) => void;
  demoActive: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => onChange('diagnose')}
          className="flex shrink-0 items-center gap-2.5 text-left"
          aria-label="返回知识漏洞侦探首页"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-canvas">
            <ScanSearch className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span className="hidden leading-tight min-[420px]:block">
            <span className="block text-[15px] font-bold tracking-tight text-ink">知识漏洞侦探</span>
            <span className="mt-0.5 block text-[11px] text-muted">高中数学</span>
          </span>
        </button>

        <nav className="flex h-full items-stretch" aria-label="主要导航">
          {items.map(({ key, label, shortLabel, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-current={active === key ? 'page' : undefined}
              aria-label={label}
              className={`relative flex min-w-[52px] items-center justify-center gap-1.5 px-2 text-sm font-medium sm:min-w-[88px] sm:px-3 ${
                active === key ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon className="hidden h-4 w-4 sm:block" strokeWidth={1.7} />
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
              {active === key && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-ink" />}
            </button>
          ))}
        </nav>

        <span className="hidden shrink-0 items-center gap-2 text-xs text-muted xl:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${demoActive ? 'bg-vermilion' : 'bg-[#AAA69D]'}`} />
          {demoActive ? '诊断结果已生成' : '本地规则诊断'}
        </span>
      </div>
    </header>
  );
}
