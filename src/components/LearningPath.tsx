import { useId } from 'react';
import { ArrowRight, Route } from 'lucide-react';
import { knowledgeNodes } from '../data/knowledge';
import type { DiagnosisResult } from '../types';

export default function LearningPath({
  weakNodeIds,
  learningPathIds,
  steps,
  confidence,
  result,
  title = '建议补习顺序',
  emptyText = '完成诊断后，这里会按知识依赖列出补习顺序。',
  expanded = false,
}: {
  weakNodeIds?: string[];
  learningPathIds?: string[];
  steps?: string[];
  confidence?: DiagnosisResult['confidence'];
  result?: DiagnosisResult | null;
  title?: string;
  emptyText?: string;
  expanded?: boolean;
}) {
  const headingId = useId();
  const weak = new Set(weakNodeIds ?? result?.weakNodeIds ?? []);
  const pathIds = learningPathIds ?? result?.learningPathIds ?? [];
  const recommendations = steps ?? result?.steps ?? [];
  const level = confidence ?? result?.confidence;

  return (
    <section className="practice-learning-path" aria-labelledby={headingId}>
      <div className="practice-subheading">
        <h2 id={headingId}><Route aria-hidden="true" />{title}</h2>
        {level === 'low' && pathIds.length > 0 && <span>复习方向 · 尚未确认薄弱</span>}
      </div>

      {pathIds.length === 0 ? (
        <p className="practice-learning-path__empty">{emptyText}</p>
      ) : (
        <>
          <ol className="practice-path-list">
            {pathIds.map((id, index) => {
              const node = knowledgeNodes.find((item) => item.id === id);
              const isWeak = weak.has(id);
              return (
                <li key={id}>
                  {index > 0 && <ArrowRight aria-hidden="true" />}
                  <div className={isWeak ? 'is-weak' : ''}>
                    <span><b>{String(index + 1).padStart(2, '0')}</b>{node?.label ?? id}</span>
                    <small>{isWeak ? '疑似薄弱' : '前置复习'}</small>
                  </div>
                </li>
              );
            })}
          </ol>

          {recommendations.length > 0 && (
            <div className={`practice-path-steps${expanded ? ' is-expanded' : ''}`}>
              {recommendations.slice(0, 3).map((step, index) => (
                <div key={`${step}-${index}`}>
                  <span>STEP {String(index + 1).padStart(2, '0')}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
