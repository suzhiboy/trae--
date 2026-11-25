import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldQuestion } from 'lucide-react';
import { knowledgeNodes } from '../../data/knowledge';
import { questionRules } from '../../data/practiceRules';
import { ruleVariant } from '../../engine/freeform';
import type {
  AttemptStatus,
  ErrorPattern,
  FreeformAiDiagnosis,
  FreeformResult as FreeformResultType,
  FreeformRuleResult,
  VerificationState,
  VerifiedClaim,
} from '../../types';
import { MixedMath } from '../MathTex';

const statusCopy: Record<AttemptStatus, { label: string; title: string }> = {
  correct: { label: 'CORRECT', title: '本题判定：正确' },
  diagnosed: { label: 'DIAGNOSED', title: '已定位到出错的一步' },
  'process-error': { label: 'PROCESS CHECK', title: '结果正确，但这一步需要检查' },
  unknown: { label: 'NEED MORE EVIDENCE', title: '证据不足或需要复核' },
};

const confidenceLabel = { high: '高', medium: '中', low: '低' } as const;

const kindLabel: Record<VerifiedClaim['kind'], string> = {
  'final-answer': '最终答案',
  'student-step': '学生步骤',
  'standard-step': '标准解法',
  index: '引用 / 序号',
  quote: '引用原句',
  arithmetic: '算术结论',
  equation: '等式结论',
  set: '集合结论',
  answer: '答案结论',
};

const conclusionCopy: Record<
  FreeformAiDiagnosis['verification']['conclusion'],
  { label: string; text: string; className: string }
> = {
  consistent: {
    label: '本地复算通过',
    text: 'AI 的可计算结论与本地复算一致；定性错因仍来自 AI 理解，不做额外背书。',
    className: 'is-verified',
  },
  partial: {
    label: '部分已核验',
    text: '数值或等式结论已通过本地复算；其余自然语言结论仍是 AI 推断。',
    className: 'is-unverified',
  },
  conflict: {
    label: 'AI 结论与复算冲突',
    text: '已按本地复算结果更正答案；AI 原结论只保留作对照，不作为确定结论。',
    className: 'is-conflict',
  },
  unverifiable: {
    label: 'AI 推断，未核验',
    text: '本题没有匹配到可独立复算的题型；以下内容只能作为线索，不能当作已核验结论。',
    className: 'is-unverified',
  },
  insufficient: {
    label: '证据不足',
    text: '模型没有给出可核验的结论。请补充题目或步骤后再试。',
    className: 'is-unverified',
  },
};

function ClaimBadge({ status }: { status: VerificationState }) {
  const Icon = status === 'verified' ? CheckCircle2 : status === 'conflict' ? AlertTriangle : ShieldQuestion;
  const label = status === 'verified' ? '已核验' : status === 'conflict' ? '冲突' : 'AI 推断';
  return (
    <span className={`freeform-badge is-${status}`}>
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

function ClaimList({ claims }: { claims: VerifiedClaim[] }) {
  if (claims.length === 0) {
    return <p className="freeform-empty">没有可核验的结论。</p>;
  }
  return (
    <div className="freeform-claims">
      {claims.map((claim, index) => (
        <article
          className={`freeform-claim is-${claim.status}`}
          key={`${claim.kind}-${claim.expression}-${index}`}
        >
          <div className="freeform-claim__head">
            <ClaimBadge status={claim.status} />
            <span>{kindLabel[claim.kind]}</span>
          </div>
          <code>{claim.expression || '（未给出表达式）'}</code>
          {(claim.claimed || claim.recomputed) && (
            <div className="freeform-claim__compare">
              {claim.claimed && <span>AI：{claim.claimed}</span>}
              {claim.recomputed && <span>复算：{claim.recomputed}</span>}
            </div>
          )}
          <p>{claim.detail}</p>
        </article>
      ))}
    </div>
  );
}

function VariantCard({ variant }: { variant: { stem: string; answer: string } | null }) {
  const [open, setOpen] = useState(false);
  if (!variant || !variant.stem) return null;
  return (
    <section className="freeform-variant">
      <div className="freeform-section-title">
        <span>变式验证</span>
        <small>先自己做一遍，再核对答案</small>
      </div>
      <p><MixedMath text={variant.stem} /></p>
      <button type="button" className="practice-text-button" onClick={() => setOpen((value) => !value)}>
        {open ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {open ? '隐藏答案' : '显示参考答案'}
      </button>
      {open && <p className="freeform-variant__answer">参考答案：{variant.answer}</p>}
    </section>
  );
}

function RuleResult({ result, studentAnswer }: { result: FreeformRuleResult; studentAnswer: string }) {
  const diagnosis = result.diagnosis;
  const variant = ruleVariant(result);
  const alternatives = diagnosis.alternativePatternIds
    .map((id) => questionRules[result.question.id]?.errorPatterns.find((pattern) => pattern.id === id))
    .filter((pattern): pattern is ErrorPattern => Boolean(pattern));
  const weakNodes = diagnosis.weakNodeIds
    .map((id) => knowledgeNodes.find((node) => node.id === id)?.label ?? id);

  return (
    <article className={`freeform-result is-${diagnosis.status}`} data-testid="freeform-result">
      <header className="freeform-result__head">
        <div>
          <span className="freeform-result__source">内置题 · 规则诊断</span>
          <h3>{statusCopy[diagnosis.status].title}</h3>
        </div>
        <div className="freeform-result__badges">
          <span>{statusCopy[diagnosis.status].label}</span>
          <span>置信度 {confidenceLabel[diagnosis.confidence]}</span>
        </div>
      </header>

      <div className="freeform-answer-compare">
        <div><span>学生答案</span><strong>{studentAnswer || '未提供'}</strong></div>
        <div><span>参考答案</span><strong>{result.question.correctAnswer}</strong></div>
      </div>

      <div className="freeform-result__grid">
        <section className="freeform-result__col">
          {diagnosis.stepQuote && diagnosis.focusStepIndex !== null && (
            <div className="freeform-quote">
              <span>{diagnosis.firstWrongStepIndex !== null
                ? `第 ${diagnosis.firstWrongStepIndex + 1} 步 · 学生原句`
                : `第 ${diagnosis.focusStepIndex + 1} 步 · 还差最后一步`}</span>
              <blockquote>{diagnosis.stepQuote}</blockquote>
            </div>
          )}

          <div className="freeform-section-title"><span>诊断结论</span></div>
          <p className="freeform-reason">{diagnosis.reason}</p>

          <div className="freeform-section-title"><span>证据与边界</span></div>
          <p>{diagnosis.evidence}</p>
          {diagnosis.processNote && <p className="freeform-note-inline">{diagnosis.processNote}</p>}

          {alternatives.length > 0 && (
            <div className="freeform-callout is-unverified">
              <strong>可能原因（待确认）</strong>
              <ul>
                {alternatives.map((pattern) => <li key={pattern.id}>{pattern.reason}</li>)}
              </ul>
              <small>只凭当前答案无法区分这些原因，不据此确认薄弱点。</small>
            </div>
          )}

          {diagnosis.probe && (
            <div className="freeform-callout">
              <strong>先回答这个问题</strong>
              <p>{diagnosis.probe}</p>
            </div>
          )}

          {diagnosis.correctedStep && (
            <div className="freeform-callout is-verified">
              <strong>下一步</strong>
              <p><MixedMath text={diagnosis.correctedStep} /></p>
            </div>
          )}

          {weakNodes.length > 0 && (
            <div className="freeform-tags">
              {weakNodes.map((label) => <span key={label}>{label}</span>)}
            </div>
          )}
        </section>

        <section className="freeform-result__col">
          <div className="freeform-section-title">
            <span>规则路径</span>
            <small>本地完成，不经过模型</small>
          </div>
          <p>本题命中内置题库，使用确定性规则定位；没有发送网络请求。</p>

          <VariantCard variant={variant} />

          <a href="#practice" className="text-link roll-trigger freeform-practice-link">
            去内置题组做变式 <ArrowRight aria-hidden="true" />
          </a>
        </section>
      </div>
    </article>
  );
}

function AiResult({ result, studentAnswer }: { result: FreeformAiDiagnosis; studentAnswer: string }) {
  const conclusion = conclusionCopy[result.verification.conclusion];
  const standardClaims = new Map(
    result.verification.claims
      .filter((claim) => claim.kind === 'standard-step')
      .map((claim) => [claim.expression, claim]),
  );

  let headline = statusCopy[result.status].title;
  if (result.verification.conclusion === 'conflict') {
    headline = 'AI 结论与复算冲突，先按复算结果复核';
  } else if (result.verification.conclusion === 'insufficient') {
    headline = '证据不足，未生成确定结论';
  } else if (result.verification.conclusion === 'unverifiable') {
    headline = 'AI 给出线索，但本题无法独立复算';
  } else if (result.verification.conclusion === 'partial') {
    headline = '部分结论已核验，其余仍是 AI 推断';
  }

  const knowledge = result.knowledgeNodeId
    ? knowledgeNodes.find((node) => node.id === result.knowledgeNodeId)?.label ?? result.knowledgePoint
    : result.knowledgePoint;

  return (
    <article className={`freeform-result is-${result.status}`} data-testid="freeform-result">
      <header className="freeform-result__head">
        <div>
          <span className="freeform-result__source">AI 理解 · 本地复算</span>
          <h3>{headline}</h3>
        </div>
        <div className="freeform-result__badges">
          <span>AI 自评 {confidenceLabel[result.aiConfidence]}</span>
          <span>核验后 {confidenceLabel[result.confidence]}</span>
        </div>
      </header>

      <div className={`freeform-verdict ${conclusion.className}`}>
        <strong>{conclusion.label}</strong>
        <p>{conclusion.text}</p>
        {result.verification.conclusion === 'conflict' && result.aiCorrectAnswer !== result.correctAnswer && (
          <p className="freeform-verdict__swap">
            AI 原答案：{result.aiCorrectAnswer} <ArrowRight aria-hidden="true" /> 复算采纳：{result.correctAnswer}
          </p>
        )}
      </div>

      <div className="freeform-answer-compare">
        <div><span>学生答案</span><strong>{studentAnswer || '未提供'}</strong></div>
        <div><span>采纳的正确答案</span><strong>{result.correctAnswer}</strong></div>
      </div>

      <div className="freeform-result__grid">
        <section className="freeform-result__col">
          <div className="freeform-section-title">
            <span>AI 的判断</span>
            <small>未核验的文字只作为线索</small>
          </div>
          <p className="freeform-reason">{result.reason}</p>
          <div className="freeform-meta">
            <span>知识点：{knowledge || '未给出'}</span>
            <span>AI 自评置信度：{confidenceLabel[result.aiConfidence]}</span>
          </div>
          {result.uncertainty && (
            <p className="freeform-note-inline">不确定性：{result.uncertainty}</p>
          )}

          {result.stepQuote && result.firstWrongStepIndex !== null && (
            <div className="freeform-quote">
              <span>第 {result.firstWrongStepIndex + 1} 步 · 学生原句</span>
              <blockquote>{result.stepQuote}</blockquote>
            </div>
          )}

          <div className="freeform-section-title">
            <span>标准解法</span>
            <small>每一步单独复算</small>
          </div>
          {result.standardSteps.length > 0 ? (
            <ol className="freeform-standard-steps">
              {result.standardSteps.map((step, index) => {
                const claim = standardClaims.get(step);
                return (
                  <li key={`${index}-${step}`}>
                    <MixedMath text={step} />
                    {claim && <ClaimBadge status={claim.status} />}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="freeform-empty">模型没有给出标准解法。</p>
          )}

          <VariantCard variant={result.variant} />
        </section>

        <section className="freeform-result__col">
          <div className="freeform-section-title">
            <span>本地复算账本</span>
            <small>只统计数学结论</small>
          </div>

          <div className="freeform-legend">
            <ClaimBadge status="verified" />
            <ClaimBadge status="conflict" />
            <ClaimBadge status="unverified" />
          </div>

          <div className="freeform-counts">
            <span className="is-verified">已核验 {result.verification.verifiedCount}</span>
            <span className="is-conflict">冲突 {result.verification.conflictCount}</span>
            <span className="is-unverified">未核验 {result.verification.unverifiedCount}</span>
          </div>

          <ClaimList claims={result.verification.claims} />

          <p className="freeform-footnote">
            AI 负责理解题目和学生步骤，规则负责独立复算。无法复算的结论不会被标成已核验。
          </p>
        </section>
      </div>
    </article>
  );
}

export default function FreeformResult({
  result,
  studentAnswer,
}: {
  result: FreeformResultType;
  studentAnswer: string;
}) {
  return result.source === 'rules'
    ? <RuleResult result={result} studentAnswer={studentAnswer} />
    : <AiResult result={result} studentAnswer={studentAnswer} />;
}
