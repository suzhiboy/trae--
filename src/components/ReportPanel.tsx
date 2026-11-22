import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Fingerprint,
  GitBranch,
  Lightbulb,
} from 'lucide-react';
import type { DiagnosisResult } from '../types';
import { knowledgeNodes } from '../data/knowledge';
import { useEffect, useState } from 'react';

const confidenceMap = {
  high: { label: '高置信度', value: 92, cls: 'text-cyan-300', bar: 'from-cyan-400 to-emerald-300' },
  medium: { label: '中置信度', value: 74, cls: 'text-violet-300', bar: 'from-violet-400 to-cyan-400' },
  low: { label: '低置信度', value: 48, cls: 'text-slate-300', bar: 'from-slate-400 to-slate-300' },
} as const;

function useAnimatedNumber(target: number, active: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / 900, 1);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return v;
}

export default function ReportPanel({
  result,
  analyzing,
  studentAnswer,
  correctAnswer,
}: {
  result: DiagnosisResult | null;
  analyzing: boolean;
  studentAnswer: string;
  correctAnswer: string;
}) {
  const conf = result ? confidenceMap[result.confidence] : null;
  const confValue = useAnimatedNumber(conf?.value ?? 0, !!result);

  return (
    <section className="glass relative flex-1 overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />

      <div className="section-title mb-4">
        <FileSearch className="h-4 w-4 text-violet-300" />
        知识漏洞报告
        {result && result.source === 'rules' && (
          <span className="chip ml-auto border-amber-400/40 bg-amber-400/10 text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            规则诊断演示
          </span>
        )}
        {result && result.source === 'ai' && (
          <span className="chip ml-auto border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            AI 模型分析
          </span>
        )}
      </div>

      {/* 空态 / 分析态 */}
      {!result && !analyzing && (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-slate-900/60">
            <Fingerprint className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">
            等待侦探出手
            <br />
            <span className="text-xs text-slate-600">提交错误答案后，这里会生成漏洞报告</span>
          </p>
        </div>
      )}

      {analyzing && (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-cyan-400 border-r-violet-400" />
            <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-indigo-400 [animation-direction:reverse] [animation-duration:1.4s]" />
            <Fingerprint className="absolute inset-0 m-auto h-6 w-6 animate-pulse text-cyan-300" />
          </div>
          <div className="space-y-1.5 text-center">
            <p className="animate-pulse text-sm font-medium text-cyan-200">正在扫描知识依赖链…</p>
            <p className="font-mono text-[11px] text-slate-500">
              tracing prerequisite graph · matching error patterns
            </p>
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent bg-[length:200%_100%]" />
          </div>
        </div>
      )}

      {result && (
        <div className="animate-fade-up space-y-4">
          {/* 答案对比 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                正确答案
              </div>
              <p className="font-mono text-lg font-semibold text-emerald-200">
                {correctAnswer || '—'}
              </p>
            </div>
            <div
              className={`rounded-xl border p-3 ${
                result.isCorrect
                  ? 'border-emerald-400/25 bg-emerald-400/5'
                  : 'border-danger/30 bg-danger/5'
              }`}
            >
              <div
                className={`mb-1 flex items-center gap-1.5 text-[11px] font-medium ${
                  result.isCorrect ? 'text-emerald-300' : 'text-danger'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                学生答案
              </div>
              <p
                className={`font-mono text-lg font-semibold ${
                  result.isCorrect ? 'text-emerald-200' : 'text-orange-300'
                }`}
              >
                {studentAnswer}
              </p>
            </div>
          </div>

          {result.isCorrect ? (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4 text-sm text-emerald-200">
              {result.reason} 继续保持！
            </div>
          ) : (
            <>
              {/* 错误根因 */}
              <div className="rounded-xl border border-danger/30 bg-gradient-to-br from-danger/10 to-transparent p-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  可能错误根因
                </div>
                <p className="text-sm leading-relaxed text-orange-100/90">{result.reason}</p>
              </div>

              {/* 判断依据 */}
              <div className="rounded-xl border border-line bg-slate-900/40 p-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Fingerprint className="h-3.5 w-3.5 text-cyan-300" />
                  判断依据
                </div>
                <p className="text-sm leading-relaxed text-slate-400">{result.evidence}</p>
              </div>

              {/* 缺失前置知识 */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <GitBranch className="h-3.5 w-3.5 text-violet-300" />
                  缺失的前置知识
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.weakNodeIds.map((id) => {
                    const n = knowledgeNodes.find((k) => k.id === id);
                    return (
                      <span
                        key={id}
                        className="chip border-danger/40 bg-danger/10 text-orange-300 shadow-glow-danger"
                      >
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                        {n?.label ?? id}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* 置信度 */}
              {conf && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">诊断置信度</span>
                    <span className={`font-mono font-semibold ${conf.cls}`}>
                      {conf.label} · {confValue}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${conf.bar} transition-all duration-1000 ease-out`}
                      style={{ width: `${confValue}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 建议补习顺序 */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-300" />
                  建议补习顺序
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {result.learningPathIds.map((id, i) => {
                    const n = knowledgeNodes.find((k) => k.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1.5">
                        {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-slate-600" />}
                        <span className="chip border-violet-400/40 bg-violet-400/10 font-mono text-violet-200">
                          <span className="text-violet-400">{i + 1}.</span> {n?.label ?? id}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
