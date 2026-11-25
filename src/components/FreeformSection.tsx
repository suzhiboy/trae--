import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, ScanSearch, ShieldQuestion } from 'lucide-react';
import { buildRuleResult, matchBuiltinQuestion } from '../engine/freeform';
import { buildAiDiagnosis } from '../engine/verify';
import {
  checkAiHealth,
  requestFreeformDiagnosis,
  type AiHealth,
  type FreeformFailure,
} from '../services/freeformDiagnosis';
import type { FreeformResult } from '../types';
import FreeformResultView from './freeform/FreeformResult';
import ImageInput from './freeform/ImageInput';

type Phase = 'idle' | 'recognizing' | 'ocr-ready' | 'diagnosing' | 'result' | 'error';

interface Submission {
  question: string;
  finalAnswer: string;
  steps: string[];
}

const retryable = new Set<FreeformFailure['code']>([
  'timeout',
  'rate-limited',
  'upstream',
  'network',
  'invalid-schema',
  'insufficient-evidence',
]);

export default function FreeformSection() {
  const [question, setQuestion] = useState('');
  const [finalAnswer, setFinalAnswer] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<FreeformResult | null>(null);
  const [failure, setFailure] = useState<FreeformFailure | null>(null);
  const [ocrNote, setOcrNote] = useState('');
  const [health, setHealth] = useState<AiHealth | null>(null);
  const requestSeq = useRef(0);
  const ocrSeq = useRef(0);
  const lastSubmission = useRef<Submission | null>(null);

  useEffect(() => {
    let alive = true;
    checkAiHealth().then((value) => {
      if (alive) setHealth(value);
    });
    return () => { alive = false; };
  }, []);

  const invalidate = () => {
    requestSeq.current += 1;
    setResult(null);
    setFailure(null);
    setOcrNote('');
    setPhase('idle');
  };

  const steps = stepsText
    .split('\n')
    .map((step) => step.trim())
    .filter(Boolean);

  const busy = phase === 'recognizing' || phase === 'diagnosing';

  const handleOcrStart = () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    ocrSeq.current = seq;
    setResult(null);
    setFailure(null);
    setOcrNote('');
    setPhase('recognizing');
  };

  const handleOcrResult = (ocr: { question: string; finalAnswer: string; steps: string[]; uncertainFields: string[] }) => {
    if (ocrSeq.current !== requestSeq.current) return;
    setHealth({ ai: true, vision: true });
    setQuestion(ocr.question);
    setFinalAnswer(ocr.finalAnswer);
    setStepsText(ocr.steps.join('\n'));
    const uncertain = ocr.uncertainFields.length > 0;
    setOcrNote(uncertain
      ? `图片识别完成，但这些字段可能不准确：${ocr.uncertainFields.join('、')}。请先核对、修改，再提交诊断。`
      : '图片识别完成。请核对题目、最终答案和步骤，确认后再提交诊断。');
    setPhase('ocr-ready');
  };

  const handleOcrError = (next: FreeformFailure) => {
    if (ocrSeq.current !== requestSeq.current) return;
    if (next.code === 'ai-not-configured') setHealth({ ai: false, vision: false });
    if (next.code === 'vision-model-required') {
      setHealth((current) => current ? { ...current, vision: false } : current);
    }
    setFailure(next);
    setPhase('error');
  };

  const submit = async (override?: Submission) => {
    const data = override ?? { question, finalAnswer, steps };
    const trimmedQuestion = data.question.trim();
    const trimmedAnswer = data.finalAnswer.trim();
    const trimmedSteps = data.steps.map((step) => step.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      setFailure({ ok: false, code: 'invalid-request', message: '请先填写题目。' });
      setPhase('error');
      return;
    }
    if (!trimmedAnswer && trimmedSteps.length === 0) {
      setFailure({ ok: false, code: 'invalid-request', message: '至少填写最终答案或一行步骤，才能定位错因。' });
      setPhase('error');
      return;
    }

    const submission: Submission = {
      question: trimmedQuestion,
      finalAnswer: trimmedAnswer,
      steps: trimmedSteps,
    };
    lastSubmission.current = submission;

    const builtin = matchBuiltinQuestion(trimmedQuestion);
    if (builtin) {
      setResult(buildRuleResult(builtin, trimmedAnswer, trimmedSteps));
      setFailure(null);
      setOcrNote('');
      setPhase('result');
      return;
    }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setPhase('diagnosing');
    setFailure(null);
    setResult(null);

    const response = await requestFreeformDiagnosis(submission);
    if (seq !== requestSeq.current) return;

    if (!response.ok) {
      if (response.code === 'ai-not-configured') setHealth({ ai: false, vision: false });
      if (response.code === 'vision-model-required') {
        setHealth((current) => current ? { ...current, vision: false } : current);
      }
      setFailure(response);
      setPhase('error');
      return;
    }

    setHealth((current) => ({ ai: true, vision: current?.vision ?? false }));
    setResult(buildAiDiagnosis(submission, response.result));
    setPhase('result');
  };

  const reset = () => {
    requestSeq.current += 1;
    lastSubmission.current = null;
    setQuestion('');
    setFinalAnswer('');
    setStepsText('');
    setResult(null);
    setFailure(null);
    setOcrNote('');
    setPhase('idle');
  };

  const healthLabel = health === null
    ? '正在检查 AI 服务…'
    : health.ai
      ? health.vision ? 'AI 服务已连接 · 图片识别可用' : 'AI 服务已连接 · 图片识别未配置'
      : 'AI 未配置 · 内置 12 题仍可离线诊断';

  return (
    <section className="freeform section-shell" id="freeform" data-testid="freeform-section" aria-labelledby="freeform-title">
      <div className="section-heading">
        <div>
          <span className="section-index">FREE INPUT / AI + RULES</span>
          <h2 id="freeform-title" data-reveal>题库之外的题，<br />也能给出证据。</h2>
        </div>
        <span className="section-count">0003</span>
      </div>

      <div className="freeform-intro">
        <p>
          模型负责读懂题目和学生步骤，本地规则负责独立复算。每个可计算结论都会标出
          「已核验 / 冲突 / 未核验」；AI 算错时，以复算结果为准。
        </p>
        <span className={`freeform-status${health?.ai ? ' is-on' : ''}`}>
          <i className="status-dot" />
          {healthLabel}
        </span>
      </div>

      <div className="freeform-form">
        <div className="freeform-fields">
          <div className="freeform-field">
            <label htmlFor="freeform-question">题目</label>
            <textarea
              id="freeform-question"
              data-testid="freeform-question"
              value={question}
              onChange={(event) => { setQuestion(event.target.value); invalidate(); }}
              placeholder="粘贴或输入一道高中数学题，例如：已知 f(x)=x²-2x+3，求 f(-1)"
              rows={3}
              spellCheck={false}
              disabled={busy}
            />
          </div>

          <div className="freeform-field">
            <label htmlFor="freeform-answer">学生最终答案</label>
            <input
              id="freeform-answer"
              data-testid="freeform-answer"
              value={finalAnswer}
              onChange={(event) => { setFinalAnswer(event.target.value); invalidate(); }}
              placeholder="例如：2"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </div>

          <div className="freeform-field">
            <label htmlFor="freeform-steps">学生步骤 <small>每行一步，可留空</small></label>
            <textarea
              id="freeform-steps"
              data-testid="freeform-steps"
              value={stepsText}
              onChange={(event) => { setStepsText(event.target.value); invalidate(); }}
              placeholder={'f(-1)=1-2+3=2\n1-2+3=2'}
              rows={5}
              spellCheck={false}
              disabled={busy}
            />
          </div>

          <p className="freeform-hint">
            可以只填最终答案；补充步骤后更容易定位错因。命中内置 12 题时直接使用本地规则，不发请求。
          </p>

          <div className="freeform-actions">
            <button
              type="button"
              className="solid-button freeform-submit"
              data-testid="freeform-submit"
              onClick={() => submit()}
              disabled={busy}
            >
              <ScanSearch aria-hidden="true" />
              {busy ? '处理中…' : '开始诊断'}
            </button>
            <button type="button" className="practice-text-button" onClick={reset} disabled={busy}>
              <RotateCcw aria-hidden="true" />清空
            </button>
          </div>
        </div>

        <aside className="freeform-side">
          <ImageInput
            disabled={busy}
            onStart={handleOcrStart}
            onRecognized={handleOcrResult}
            onError={handleOcrError}
            onFileSelected={invalidate}
          />

          <div className="freeform-rules">
            <div className="freeform-rules__title">
              <ShieldQuestion aria-hidden="true" />
              <span>这里会发生什么</span>
            </div>
            <ol>
              <li>命中内置题：本地规则诊断，离线、快。</li>
              <li>其他题：模型给出结构化诊断，本地再逐条复算。</li>
              <li>算不出的结论：明确标「AI 推断，未核验」，不硬判。</li>
            </ol>
            <small>图片会发送到服务端模型；密钥只存在服务端。</small>
          </div>
        </aside>
      </div>

      <div className="freeform-feedback" aria-live="polite">
        {ocrNote && (
          <div className="freeform-ocr-note">
            <CheckCircle2 aria-hidden="true" />
            <p>{ocrNote}</p>
          </div>
        )}

        {phase === 'recognizing' && (
          <div className="freeform-progress">
            <i className="status-dot" />
            <p>正在识别图片并转录题目、答案和步骤…</p>
          </div>
        )}

        {phase === 'diagnosing' && (
          <div className="freeform-progress">
            <i className="status-dot" />
            <p>正在请求模型，并逐条做本地复算…</p>
          </div>
        )}

        {phase === 'error' && failure && (
          <div className={`freeform-error${failure.code === 'ai-not-configured' ? ' is-config' : ''}`} role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>{failure.code === 'ai-not-configured' ? 'AI 服务暂不可用' : '本次诊断没有完成'}</strong>
              <p>{failure.message}</p>
              <div className="freeform-error__actions">
                {retryable.has(failure.code) && lastSubmission.current && (
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => lastSubmission.current && submit(lastSubmission.current)}
                  >
                    重试
                  </button>
                )}
                {failure.code === 'ai-not-configured' && (
                  <a href="#practice" className="text-link">先做内置 12 题</a>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === 'result' && result && (
          <FreeformResultView result={result} studentAnswer={lastSubmission.current?.finalAnswer ?? finalAnswer} />
        )}
      </div>

      <div className="freeform-footer">
        <p>任意题诊断与图片识别需要联网；内置 12 题和上方比较演示仍可离线运行。</p>
        <span>AI 自评置信度 ≠ 已核验</span>
      </div>
    </section>
  );
}
