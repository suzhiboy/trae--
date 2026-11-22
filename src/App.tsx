import { useCallback, useEffect, useState } from 'react';
import TopNav from './components/TopNav';
import Sidebar, { type ViewKey } from './components/Sidebar';
import DiagnosisInput from './components/DiagnosisInput';
import ReportPanel from './components/ReportPanel';
import KnowledgeGraph from './components/KnowledgeGraph';
import LearningPath from './components/LearningPath';
import HistoryPanel from './components/HistoryPanel';
import { diagnose } from './engine/diagnose';
import { questions } from './data/knowledge';
import type { DiagnosisResult } from './types';

export interface HistoryItem {
  id: string;
  time: string;
  questionStem: string;
  studentAnswer: string;
  isCorrect: boolean;
  weakCount: number;
}

const HISTORY_KEY = 'kd-history';

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryItem[];
  } catch {
    return [];
  }
}

export default function App() {
  const [view, setView] = useState<ViewKey>('diagnose');
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [resultAnswer, setResultAnswer] = useState('');
  const [resultQuestionId, setResultQuestionId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  }, [history]);

  const handleDiagnose = useCallback((qId: string, ans: string, stem: string) => {
    setAnalyzing(true);
    setResult(null);
    // 分析动画约 1 秒后输出诊断结果
    window.setTimeout(() => {
      const r = diagnose(qId, ans);
      setResult(r);
      setResultAnswer(ans);
      setResultQuestionId(qId);
      setAnalyzing(false);
      setHistory((h) => [
        {
          id: `${Date.now()}`,
          time: new Date().toLocaleString('zh-CN', { hour12: false }),
          questionStem: stem,
          studentAnswer: ans,
          isCorrect: r.isCorrect,
          weakCount: r.weakNodeIds.length,
        },
        ...h,
      ]);
    }, 1000);
  }, []);

  const showComposite = view === 'diagnose';

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNav demoActive={result !== null || analyzing} />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={view} onChange={setView} />

        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {showComposite && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* 左列：输入 + 报告 */}
              <div className="flex flex-col gap-5 xl:col-span-5">
                <DiagnosisInput
                  questionId={questionId}
                  answer={answer}
                  analyzing={analyzing}
                  onQuestionChange={(id) => {
                    setQuestionId(id);
                    setResult(null);
                  }}
                  onAnswerChange={setAnswer}
                  onDiagnose={handleDiagnose}
                />
                <ReportPanel
                  result={result}
                  analyzing={analyzing}
                  studentAnswer={resultAnswer}
                  correctAnswer={
                    questions.find((q) => q.id === resultQuestionId)?.correctAnswer ?? ''
                  }
                />
              </div>

              {/* 右列：知识图谱 + 学习路径 */}
              <div className="flex flex-col gap-5 xl:col-span-7">
                <div className="h-[420px] xl:h-[480px]">
                  <KnowledgeGraph result={result} analyzing={analyzing} />
                </div>
                <LearningPath result={result} />
              </div>
            </div>
          )}

          {view === 'graph' && (
            <div className="h-full min-h-[560px]">
              <KnowledgeGraph result={result} analyzing={analyzing} full />
            </div>
          )}

          {view === 'path' && (
            <div className="mx-auto max-w-5xl">
              <LearningPath result={result} expanded />
            </div>
          )}

          {view === 'history' && (
            <div className="mx-auto max-w-4xl">
              <HistoryPanel
                history={history}
                onClear={() => setHistory([])}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
