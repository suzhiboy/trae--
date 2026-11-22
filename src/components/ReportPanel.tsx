import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Fingerprint,
  Lightbulb,
  MessageCircleQuestion,
} from 'lucide-react';
import type { DiagnosisResult, Question } from '../types';
import { knowledgeNodes, questions } from '../data/knowledge';
import { relatedQuestionIds, stemLatex } from '../data/highSchool';
import { MixedMath } from './MathTex';

const confidenceLabels = {
  high: '高置信度',
  medium: '中置信度',
  low: '低置信度',
} as const;

export default function ReportPanel({
  result,
  analyzing,
  studentAnswer,
  correctAnswer,
  questionId,
  onFollowUp,
}: {
  result: DiagnosisResult | null;
  analyzing: boolean;
  studentAnswer: string;
  correctAnswer: string;
  questionId: string | null;
  onFollowUp?: (questionId: string) => void;
}) {
  const followUps: Question[] = result && !result.isCorrect
    ? [...new Set(result.weakNodeIds.flatMap((id) => relatedQuestionIds[id] ?? []))]
        .filter((id) => id !== questionId)
        .map((id) => questions.find((question) => question.id === id))
        .filter((question): question is Question => !!question)
        .slice(0, 2)
    : [];

  return (
    <section className="panel mt-5 p-5 sm:p-6" aria-labelledby="report-title" aria-live="polite">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="report-title" className="section-title">
          <FileSearch className="h-5 w-5" strokeWidth={1.7} />
          诊断结论
        </h2>
        {result && (
          <span className={`chip ${result.source === 'rules' ? 'border-line bg-white/60 text-muted' : 'border-ink text-ink'}`}>
            {result.source === 'rules' ? '规则诊断' : 'AI 诊断'}
          </span>
        )}
      </div>

      {!result && !analyzing && (
        <div className="flex min-h-[136px] items-center gap-3 border-t border-line pt-5 text-muted">
          <Fingerprint className="h-8 w-8 shrink-0" strokeWidth={1.4} />
          <div>
            <p className="text-sm font-medium text-ink">等待一次作答</p>
            <p className="mt-1 text-sm leading-relaxed">提交后将在这里说明可能原因与推断依据。</p>
          </div>
        </div>
      )}

      {analyzing && <p className="min-h-[136px] border-t border-line pt-5 text-sm text-muted">正在匹配本地诊断规则…</p>}

      {result && (
        <div className="result-enter space-y-5">
          <div className="grid grid-cols-2 gap-3 border-y border-line py-4">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.7} />
                正确答案
              </div>
              <p className="break-words font-mono text-xl font-semibold text-ink">{correctAnswer || '—'}</p>
            </div>
            <div className="border-l border-line pl-4">
              <div className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${result.isCorrect ? 'text-muted' : 'text-vermilion'}`}>
                <AlertTriangle className="h-4 w-4" strokeWidth={1.7} />
                学生答案
              </div>
              <p className={`break-words font-mono text-xl font-semibold ${result.isCorrect ? 'text-ink' : 'text-vermilion'}`}>
                {studentAnswer}
              </p>
            </div>
          </div>

          {result.isCorrect ? (
            <div className="space-y-3">
              <div>
                <h3 className="mb-1.5 text-sm font-bold text-ink">诊断结论</h3>
                <p className="text-sm leading-relaxed text-muted">{result.reason}。</p>
              </div>
              <div>
                <h3 className="mb-1.5 text-sm font-bold text-ink">核对依据</h3>
                <p className="text-sm leading-relaxed text-muted">{result.evidence}</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-vermilion">
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.8} />
                  可能原因
                </h3>
                <p className="text-[15px] font-medium leading-relaxed text-ink">{result.reason}</p>
              </div>

              <div className="border-t border-line pt-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
                  <Fingerprint className="h-4 w-4" strokeWidth={1.8} />
                  推断依据
                </h3>
                <p className="text-sm leading-7 text-muted">{result.evidence}</p>
              </div>

              {result.weakNodeIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted">疑似薄弱</span>
                  {result.weakNodeIds.map((id) => {
                    const node = knowledgeNodes.find((item) => item.id === id);
                    return (
                      <span key={id} className="chip border-vermilion bg-[#F8E8E1] text-vermilion">
                        {node?.label ?? id}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs">
                <span className="text-muted">诊断置信度</span>
                <span className={`font-semibold ${result.confidence === 'low' ? 'text-vermilion' : 'text-ink'}`}>
                  {confidenceLabels[result.confidence]}
                </span>
              </div>

              {result.confidence === 'low' && (
                <div className="rounded-md border border-vermilion bg-[#F8E8E1] p-3.5">
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-vermilion">
                    <Lightbulb className="h-4 w-4" strokeWidth={1.8} />
                    下一步
                  </div>
                  <p className="text-sm leading-relaxed text-ink">
                    补充至少一步中间计算后重新诊断。当前只提供复习方向，尚未确认具体知识点薄弱。
                  </p>
                </div>
              )}

              {followUps.length > 0 && (
                <div className="border-t border-line pt-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
                    <MessageCircleQuestion className="h-4 w-4" strokeWidth={1.8} />
                    换一题验证
                  </h3>
                  <div className="space-y-2">
                    {followUps.map((question) => (
                      <button
                        key={question.id}
                        onClick={() => onFollowUp?.(question.id)}
                        className="w-full rounded-md border border-line bg-white/50 px-3 py-2.5 text-left text-sm text-ink hover:border-ink"
                      >
                        {stemLatex[question.id] ? <MixedMath text={stemLatex[question.id]} /> : question.stem}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
