import { useState } from 'react';
import { Check, Clipboard, RotateCcw } from 'lucide-react';
import { knowledgeNodes, questions } from '../../data/knowledge';
import { stemLatex } from '../../data/highSchool';
import { rowsFromSessionReport } from '../../engine/teacher';
import type { PracticeAttempt, SessionReport } from '../../types';
import KnowledgeGraph from '../KnowledgeGraph';
import LearningPath from '../LearningPath';
import { MixedMath } from '../MathTex';
import CsvExportBar from '../report/CsvExportBar';

const attemptStatus = {
  correct: '答案正确',
  diagnosed: '已诊断典型错误',
  'process-error': '结果正确，过程需检查',
  unknown: '证据不足',
} as const;

function verificationText(attempt: PracticeAttempt): string {
  if (attempt.kind !== 'answered') return '未生成变式';
  if (attempt.verification === 'corrected') {
    return attempt.variantAttempts <= 1
      ? '本次变式答对（首次作答）'
      : `本次变式答对（第 ${attempt.variantAttempts} 次尝试）`;
  }
  if (attempt.verification === 'needs-review') {
    return attempt.variantAttempts <= 1
      ? '仍需复习（首次作答）'
      : `仍需复习（第 ${attempt.variantAttempts} 次尝试）`;
  }
  if (attempt.verification === 'pending') return '未完成变式';
  return '无需变式';
}

export function buildPlainTextReport(report: SessionReport, groupTitle: string): string {
  const weakLabels = report.weakNodeIds.map((id) => knowledgeNodes.find((node) => node.id === id)?.label ?? id);
  const pathLabels = report.learningPathIds.map((id) => knowledgeNodes.find((node) => node.id === id)?.label ?? id);
  const unanswered = report.attempts.filter((attempt) => attempt.kind === 'unanswered').length;
  const lines = [
    'KNOWLEDGE DETECTIVE / 练习报告',
    `题组：${groupTitle}`,
    `总题数：${report.total}；实际作答：${report.answered}；答对：${report.correct}；正确率：${Math.round(report.accuracy)}%`,
    `典型错误：${report.diagnosed}；过程需检查：${report.processError}；证据不足：${report.unknown}；跳过：${report.skipped}；我不会：${unanswered}`,
    `变式首次答对：${report.attempts.filter((attempt) => attempt.verification === 'corrected' && attempt.variantAttempts === 1).length} / 实际尝试：${report.attempts.filter((attempt) => attempt.variantAttempts > 0).length}`,
    `平均作答用时：${Math.round(report.averageSeconds)} 秒`,
    `疑似薄弱点：${weakLabels.join('、') || '无'}`,
    `建议学习路径：${pathLabels.join(' → ') || '无'}`,
    '',
  ];

  report.attempts.forEach((attempt, index) => {
    const question = questions.find((item) => item.id === attempt.questionId);
    lines.push(`${index + 1}. ${question?.stem ?? attempt.questionId}`);
    if (attempt.kind !== 'answered') {
      lines.push(`状态：${attempt.kind === 'skipped' ? '已跳过' : '我不会'}；用时：${attempt.elapsedSeconds} 秒；未生成诊断。`, '');
      return;
    }
    const status = attempt.diagnosis ? attemptStatus[attempt.diagnosis.status] : '未诊断';
    lines.push(`状态：${status}；用时：${attempt.elapsedSeconds} 秒`);
    lines.push(`最终答案：${attempt.finalAnswer}`);
    lines.push(`解题步骤：${attempt.steps.filter((step) => step.trim()).join(' → ') || '未填写'}`);
    if (attempt.diagnosis) {
      lines.push(`诊断：${attempt.diagnosis.reason}`);
      lines.push(`证据：${attempt.diagnosis.evidence}`);
    }
    lines.push(`变式验证：${verificationText(attempt)}`, '');
  });
  return lines.join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续使用选区复制作为降级方案。
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}

export default function SessionSummary({
  report,
  groupTitle,
  onRedoWrong,
}: {
  report: SessionReport;
  groupTitle: string;
  onRedoWrong: () => void;
}) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const unanswered = report.attempts.filter((attempt) => attempt.kind === 'unanswered').length;
  const wrongCount = report.attempts.filter((attempt) => (
    ['diagnosed', 'process-error', 'unknown'].includes(attempt.diagnosis?.status ?? '')
  )).length;
  const variantAttempts = report.attempts.filter((attempt) => attempt.variantAttempts > 0);
  const variantFirstTry = variantAttempts.filter((attempt) => (
    attempt.verification === 'corrected' && attempt.variantAttempts === 1
  )).length;

  const copyReport = async () => {
    const success = await copyText(buildPlainTextReport(report, groupTitle));
    setCopied(success ? 'done' : 'failed');
  };

  return (
    <section className="practice-summary" data-testid="practice-summary" aria-labelledby="practice-summary-title">
      <div className="practice-summary__header">
        <div>
          <span>SESSION COMPLETE / {groupTitle}</span>
          <h3 id="practice-summary-title">这组题，已经有下一步。</h3>
          <p>报告只根据本次实际作答生成；跳过与“我不会”不计入正确率分母。</p>
        </div>
        <div className="practice-summary__actions">
          <button type="button" data-testid="practice-copy-report" className="outline-button" onClick={copyReport}>
            {copied === 'done' ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
            {copied === 'done' ? '已复制' : '复制纯文本报告'}
          </button>
          {wrongCount > 0 && (
            <button type="button" data-testid="practice-redo-wrong" className="solid-button" onClick={onRedoWrong}>
              <RotateCcw aria-hidden="true" />只重做错题（{wrongCount}）
            </button>
          )}
        </div>
      </div>
      <span className="practice-copy-status" role="status">
        {copied === 'failed' ? '复制失败，请检查浏览器剪贴板权限。' : copied === 'done' ? '纯文本报告已复制到剪贴板。' : ''}
      </span>

      <div className="practice-summary__metrics">
        <div><span>正确率</span><strong>{Math.round(report.accuracy)}%</strong></div>
        <div><span>答对 / 作答</span><strong>{report.correct} / {report.answered}</strong></div>
        <div><span>平均用时</span><strong>{Math.round(report.averageSeconds)}s</strong></div>
        <div><span>薄弱知识点</span><strong>{report.weakNodeIds.length}</strong></div>
      </div>
      <div className="practice-summary__statuses">
        <span>典型错误 {report.diagnosed}</span>
        <span>过程需检查 {report.processError}</span>
        <span>证据不足 {report.unknown}</span>
        <span>跳过 {report.skipped}</span>
        <span>我不会 {unanswered}</span>
        <span>变式首次答对 {variantFirstTry} / 尝试 {variantAttempts.length}</span>
      </div>

      <CsvExportBar
        buildRows={(studentId) => rowsFromSessionReport(report, groupTitle, studentId)}
        filenamePrefix={`会话报告-${groupTitle}`}
        note="CSV 只包含本次会话的真实作答，可粘贴到教师视图聚合。"
        testId="practice-export-csv"
      />

      <div className="practice-summary__attempts" data-lenis-prevent>
        {report.attempts.map((attempt, index) => {
          const question = questions.find((item) => item.id === attempt.questionId);
          return (
            <article key={`${attempt.questionId}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h4><MixedMath text={question ? stemLatex[question.id] ?? question.stem : attempt.questionId} /></h4>
                <p>{attempt.kind === 'answered' ? `答：${attempt.finalAnswer}` : attempt.kind === 'skipped' ? '已跳过' : '我不会'}</p>
              </div>
              <div>
                <b>{attempt.kind === 'answered' && attempt.diagnosis ? attemptStatus[attempt.diagnosis.status] : '未生成诊断'}</b>
                <small>{attempt.elapsedSeconds}s · {verificationText(attempt)}</small>
              </div>
            </article>
          );
        })}
      </div>

      <div className="practice-summary__insights">
        <LearningPath
          weakNodeIds={report.weakNodeIds}
          learningPathIds={report.learningPathIds}
          title="本组建议补习顺序"
          emptyText={report.answered === 0 ? '本组没有实际作答，因此不生成薄弱点和补习顺序。' : '本组没有已确认的薄弱点，无需生成补习顺序。'}
          expanded
        />
        <KnowledgeGraph result={report} full />
      </div>
    </section>
  );
}
