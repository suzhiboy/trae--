import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { recordAiFailure, recordAiSuccess } from '../../services/aiCredential';
import { answersEquivalent, buildAiDiagnosis } from '../../engine/verify';
import { compareVariantError, type VariantComparison } from '../../engine/variantReview';
import { requestFreeformDiagnosis } from '../../services/freeformDiagnosis';
import type {
  AiCredential,
  FreeformAiDiagnosis,
  VerifiedFreeformVariant,
  VariantErrorVerdict,
} from '../../types';
import { MixedMath } from '../MathTex';

export interface VariantPracticeState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  variants: VerifiedFreeformVariant[];
  rejectedCount: number;
  exhausted: boolean;
  message: string;
}

const verdictCopy: Record<
  VariantErrorVerdict,
  { label: string; className: string }
> = {
  'same-error': { label: '错因很可能仍在', className: 'is-same' },
  'different-error': { label: '原错因未复现，出现新问题', className: 'is-different' },
  undetermined: { label: '无法可靠判断是否同一错因', className: 'is-undetermined' },
};

const kindLabel: Record<NonNullable<VerifiedFreeformVariant['verification']['kind']>, string> = {
  function: '函数代入',
  equation: '方程求根',
  sequence: '等差数列',
  set: '集合运算',
  arithmetic: '纯数字算式',
};

interface AttemptResult {
  correct: boolean;
  attempts: number;
  comparison: VariantComparison | null;
  variantReason: string;
  error: string | null;
  previous: { comparison: VariantComparison | null; attempts: number } | null;
}

function VariantItem({
  index,
  variant,
  originalDiagnosis,
  credential,
}: {
  index: number;
  variant: VerifiedFreeformVariant;
  originalDiagnosis: FreeformAiDiagnosis;
  credential: AiCredential | null;
}) {
  const [answer, setAnswer] = useState('');
  const [step, setStep] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const clearConclusion = () => {
    if (result) setResult(null);
    setRevealed(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || checking) return;

    const attemptNumber = attempts + 1;
    const previous = result
      ? { comparison: result.comparison, attempts: result.attempts }
      : null;
    setAttempts(attemptNumber);
    setChecking(true);
    setRevealed(false);

    if (answersEquivalent(trimmed, variant.answer)) {
      setResult({
        correct: true,
        attempts: attemptNumber,
        comparison: null,
        variantReason: '',
        error: null,
        previous,
      });
      setChecking(false);
      return;
    }

    if (!credential) {
      setResult({
        correct: false,
        attempts: attemptNumber,
        comparison: null,
        variantReason: '',
        error: '已选择自定义 Key，但尚未启用。请先在「AI 设置」中填写并启用，或切回站点配置。',
        previous,
      });
      setChecking(false);
      return;
    }

    const steps = step.trim() ? [step.trim()] : [];
    try {
      const response = await requestFreeformDiagnosis({
        question: variant.stem,
        finalAnswer: trimmed,
        steps,
      }, credential);
      if (!alive.current) return;
      if (!response.ok) {
        recordAiFailure(credential, response.code, response.message);
        setResult({
          correct: false,
          attempts: attemptNumber,
          comparison: null,
          variantReason: '',
          error: response.message,
          previous,
        });
        setChecking(false);
        return;
      }
      recordAiSuccess(credential);
      const diagnosis = buildAiDiagnosis(
        { question: variant.stem, finalAnswer: trimmed, steps },
        response.result,
      );
      const comparison = compareVariantError(originalDiagnosis, diagnosis);
      if (!alive.current) return;
      setResult({
        correct: false,
        attempts: attemptNumber,
        comparison,
        variantReason: diagnosis.reason,
        error: null,
        previous,
      });
    } catch {
      recordAiFailure(credential, 'network', '网络中断，变式诊断没有完成。');
      if (!alive.current) return;
      setResult({
        correct: false,
        attempts: attemptNumber,
        comparison: null,
        variantReason: '',
        error: '网络中断，变式诊断没有完成。',
        previous,
      });
    } finally {
      if (alive.current) setChecking(false);
    }
  };

  return (
    <article className="freeform-variant-practice" data-testid={`freeform-variant-${index + 1}`}>
      <header className="freeform-variant-practice__head">
        <span>变式 {String(index + 1).padStart(2, '0')}</span>
        <span className="freeform-variant-practice__badge">
          <CheckCircle2 aria-hidden="true" />答案已复算
        </span>
      </header>

      <p className="freeform-variant-practice__stem"><MixedMath text={variant.stem} /></p>
      <p className="freeform-variant-practice__source">
        题目由 AI 生成 · 答案通过本地独立复算（{kindLabel[variant.verification.kind ?? 'arithmetic']}）
      </p>

      <form className="freeform-variant-practice__form" onSubmit={handleSubmit}>
        <label>
          <span>你的答案</span>
          <input
            value={answer}
            onChange={(event) => { setAnswer(event.target.value); clearConclusion(); }}
            placeholder="先自己算一遍"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          <span>关键一步 <small>可选，有助于定位错因</small></span>
          <input
            value={step}
            onChange={(event) => { setStep(event.target.value); clearConclusion(); }}
            placeholder="例如 f(2)=4-4+3=3"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="outline-button" disabled={!answer.trim() || checking}>
          {checking ? '正在诊断这次作答…' : attempts > 0 ? '再次提交' : '提交变式答案'}
        </button>
      </form>

      {result && (
        <div
          className={`freeform-variant-result${result.correct ? ' is-correct' : ' is-wrong'}`}
          role="status"
        >
          <div className="freeform-variant-result__head">
            {result.correct
              ? <CheckCircle2 aria-hidden="true" />
              : <AlertTriangle aria-hidden="true" />}
            <strong>{result.correct ? '本次变式答对' : '答案不正确'}</strong>
            <small>{result.attempts <= 1 ? '首次作答' : `第 ${result.attempts} 次尝试`}</small>
          </div>

          {result.correct ? (
            <>
              <p>本地复算：{variant.verification.detail}</p>
              {result.previous && (
                <p className="freeform-variant-result__previous">
                  前一次（第 {result.previous.attempts} 次）：
                  {verdictCopy[result.previous.comparison?.verdict ?? 'undetermined'].label}
                </p>
              )}
              <p className="freeform-variant-result__caveat">
                一次变式只验证这一次作答，不据此推断长期掌握。
              </p>
            </>
          ) : (
            <>
              <p>
                你的答案与本地复算不一致。
                {result.error ? `变式诊断未完成：${result.error}` : ''}
              </p>

              {result.comparison && (
                <div className={`freeform-variant-verdict ${verdictCopy[result.comparison.verdict].className}`}>
                  <strong>{verdictCopy[result.comparison.verdict].label}</strong>
                  <p>{result.comparison.detail}</p>
                  {result.variantReason && <p>变式诊断（AI）：{result.variantReason}</p>}
                  <small>依据是两次 AI 诊断的知识点对比，未经独立核验；答案对错由本地复算判定。</small>
                </div>
              )}

              <div className="freeform-variant-result__actions">
                <button
                  type="button"
                  className="practice-text-button"
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {revealed ? '隐藏参考答案' : '查看参考答案与复算依据'}
                </button>
                {revealed && (
                  <p className="freeform-variant-result__answer">
                    参考答案：{variant.answer}。{variant.verification.detail}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function VariantPractice({
  state,
  originalDiagnosis,
  credential,
  onRetry,
}: {
  state: VariantPracticeState;
  originalDiagnosis: FreeformAiDiagnosis;
  credential: AiCredential | null;
  onRetry: () => void;
}) {
  if (state.status === 'loading') {
    return (
      <section className="freeform-variants" data-testid="freeform-variants">
        <div className="freeform-section-title">
          <span>变式验证</span>
          <small>答案先经本地复算</small>
        </div>
        <div className="freeform-progress">
          <i className="status-dot" />
          <p>正在生成 2 道同错因变式，并逐题复算答案…</p>
        </div>
      </section>
    );
  }

  if (state.variants.length === 0) {
    return (
      <section className="freeform-variants" data-testid="freeform-variants">
        <div className="freeform-section-title">
          <span>变式验证</span>
          <small>没有展示未复算的题</small>
        </div>
        <div className="freeform-variant-empty">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>没有找到可通过本地复算的变式</strong>
            <p>
              当前只展示能从题干独立算出答案的题型（函数代入、集合运算、方程求根、
              等差数列、纯数字算式）。这道题可能不属于其中，或模型没有给出合格候选。
            </p>
            {state.rejectedCount > 0 && (
              <p>已丢弃 {state.rejectedCount} 道未通过复算的候选，不会展示给学生。</p>
            )}
            {state.message && <p>{state.message}</p>}
            <button type="button" className="outline-button" onClick={onRetry}>
              <RefreshCw aria-hidden="true" />重新生成
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="freeform-variants" data-testid="freeform-variants">
      <div className="freeform-section-title">
        <span>变式验证</span>
        <small>题目由 AI 生成 · 答案由本地复算</small>
      </div>
      <p className="freeform-variants__intro">
        做错时再诊断一次这次作答：判断原错因是否仍在，还是出现了新问题。
      </p>

      {state.variants.map((variant, index) => (
        <VariantItem
          key={`${variant.id}-${variant.stem}`}
          index={index}
          variant={variant}
          originalDiagnosis={originalDiagnosis}
          credential={credential}
        />
      ))}

      {state.exhausted && (
        <p className="freeform-variants__note">
          只找到 {state.variants.length} 道通过复算的变式，未用未核验的题凑数。
        </p>
      )}
      {state.rejectedCount > 0 && (
        <p className="freeform-variants__note">
          已丢弃 {state.rejectedCount} 道答案未通过复算的候选。
        </p>
      )}
      {state.message && <p className="freeform-variants__note">{state.message}</p>}

      <button type="button" className="practice-text-button" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />重新生成
      </button>
    </section>
  );
}
