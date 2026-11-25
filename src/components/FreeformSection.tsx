import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, ScanSearch, Settings2, ShieldQuestion } from 'lucide-react';
import { planFreeformDiagnosis } from '../engine/freeform';
import { summarizeDiagnoses } from '../engine/session';
import { buildAiDiagnosis } from '../engine/verify';
import { collectVerifiedVariants } from '../engine/variant';
import {
  activeAiCredential,
  recordAiFailure,
  recordAiSuccess,
  useAiSettings,
} from '../services/aiCredential';
import {
  checkAiHealth,
  requestFreeformDiagnosis,
  requestVariantCandidates,
  type AiHealth,
  type FreeformFailure,
} from '../services/freeformDiagnosis';
import {
  addFreeformRecord,
  loadFreeformRecords,
  recordFromResult,
  saveFreeformRecords,
} from '../services/freeformRecords';
import type {
  AiCredential,
  DiagnosisRecord,
  FreeformAiDiagnosis,
  FreeformResult,
  FreeformVariantCandidate,
} from '../types';
import AiSettings from './freeform/AiSettings';
import FreeformRecords from './freeform/FreeformRecords';
import FreeformResultView from './freeform/FreeformResult';
import ImageInput from './freeform/ImageInput';
import VariantPractice, { type VariantPracticeState } from './freeform/VariantPractice';

type Phase = 'idle' | 'recognizing' | 'ocr-ready' | 'diagnosing' | 'result' | 'error';

interface Submission {
  question: string;
  finalAnswer: string;
  steps: string[];
}

const emptyVariantState: VariantPracticeState = {
  status: 'idle',
  variants: [],
  rejectedCount: 0,
  exhausted: false,
  message: '',
};

function canGenerateVariants(diagnosis: FreeformAiDiagnosis): boolean {
  return diagnosis.status === 'diagnosed' || diagnosis.status === 'process-error';
}

const retryable = new Set<FreeformFailure['code']>([
  'timeout',
  'rate-limited',
  'upstream',
  'network',
  'invalid-schema',
  'insufficient-evidence',
]);

const credentialFailureCodes = new Set<FreeformFailure['code']>([
  'ai-not-configured',
  'ai-model-not-configured',
  'custom-key-required',
  'custom-key-invalid',
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
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [variantState, setVariantState] = useState<VariantPracticeState>(emptyVariantState);
  const [records, setRecords] = useState<DiagnosisRecord[]>(() => loadFreeformRecords());
  const aiSettings = useAiSettings();
  const requestSeq = useRef(0);
  const ocrSeq = useRef(0);
  const variantSeq = useRef(0);
  const lastSubmission = useRef<Submission | null>(null);

  useEffect(() => {
    saveFreeformRecords(records);
  }, [records]);

  useEffect(() => {
    let alive = true;
    checkAiHealth().then((value) => {
      if (alive) setHealth(value);
    });
    return () => { alive = false; };
  }, []);

  const invalidate = () => {
    requestSeq.current += 1;
    variantSeq.current += 1;
    setResult(null);
    setFailure(null);
    setOcrNote('');
    setVariantState(emptyVariantState);
    setPhase('idle');
  };

  const runVariantCollection = (
    submission: Submission,
    diagnosis: FreeformAiDiagnosis,
    initialCandidates: FreeformVariantCandidate[],
    credential: AiCredential,
    excludeStems: string[] = [],
  ) => {
    const seq = variantSeq.current + 1;
    variantSeq.current = seq;
    setVariantState({ ...emptyVariantState, status: 'loading' });

    let usedInitial = false;
    collectVerifiedVariants(async (round, exclude) => {
      if (round === 0 && !usedInitial && initialCandidates.length > 0) {
        usedInitial = true;
        return initialCandidates;
      }
      const response = await requestVariantCandidates({
        question: submission.question,
        errorReason: diagnosis.aiReason || diagnosis.reason,
        knowledgePoint: diagnosis.knowledgePoint,
        count: 2,
        excludeStems: exclude,
      }, credential);
      if (!response.ok) {
        recordAiFailure(credential, response.code, response.message);
        throw new Error(response.message);
      }
      recordAiSuccess(credential);
      return response.variants;
    }, {
      target: 2,
      maxRounds: 2,
      excludeStems,
    }).then((outcome) => {
      if (seq !== variantSeq.current) return;
      setVariantState({
        status: outcome.verified.length > 0 ? 'ready' : 'error',
        variants: outcome.verified,
        rejectedCount: outcome.rejected.length,
        exhausted: outcome.exhausted,
        message: outcome.requestError ?? '',
      });
    });
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
    variantSeq.current += 1;
    setResult(null);
    setFailure(null);
    setOcrNote('');
    setVariantState(emptyVariantState);
    setPhase('recognizing');
  };

  const handleOcrResult = (ocr: { question: string; finalAnswer: string; steps: string[]; uncertainFields: string[] }) => {
    if (ocrSeq.current !== requestSeq.current) return;
    setHealth((current) => current ? { ...current, vision: true } : current);
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
    if (next.code === 'ai-not-configured') {
      setHealth((current) => current ? { ...current, ai: false } : current);
    }
    if (next.code === 'ai-model-not-configured') {
      setHealth((current) => current ? { ...current, customKeyReady: false } : current);
    }
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

    const plan = planFreeformDiagnosis(trimmedQuestion, trimmedAnswer, trimmedSteps);
    if (plan.kind === 'rules') {
      variantSeq.current += 1;
      setVariantState(emptyVariantState);
      setResult(plan.result);
      setRecords((current) => addFreeformRecord(current, recordFromResult(submission, plan.result)));
      setFailure(null);
      setOcrNote('');
      setPhase('result');
      return;
    }

    const credential = activeAiCredential();
    if (!credential) {
      setFailure({
        ok: false,
        code: 'custom-key-required',
        message: '已选择自定义 Key，但还没有启用。请先在「AI 设置」里填写并启用，或切回站点配置。',
      });
      setPhase('error');
      return;
    }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    variantSeq.current += 1;
    setVariantState(emptyVariantState);
    setPhase('diagnosing');
    setFailure(null);
    setResult(null);

    const response = await requestFreeformDiagnosis(submission, credential);
    if (seq !== requestSeq.current) return;

    if (!response.ok) {
      recordAiFailure(credential, response.code, response.message);
      if (response.code === 'ai-not-configured') {
        setHealth((current) => current ? { ...current, ai: false } : current);
      }
      if (response.code === 'ai-model-not-configured') {
        setHealth((current) => current ? { ...current, customKeyReady: false } : current);
      }
      if (response.code === 'vision-model-required') {
        setHealth((current) => current ? { ...current, vision: false } : current);
      }
      setFailure(response);
      setPhase('error');
      return;
    }

    recordAiSuccess(credential);
    const diagnosis = buildAiDiagnosis(submission, response.result);
    setResult(diagnosis);
    setRecords((current) => addFreeformRecord(current, recordFromResult(submission, diagnosis)));
    setPhase('result');
    if (canGenerateVariants(diagnosis)) {
      const candidates = response.result.variants?.length
        ? response.result.variants
        : [response.result.variant];
      runVariantCollection(submission, diagnosis, candidates, credential);
    }
  };

  const reset = () => {
    requestSeq.current += 1;
    variantSeq.current += 1;
    lastSubmission.current = null;
    setQuestion('');
    setFinalAnswer('');
    setStepsText('');
    setResult(null);
    setFailure(null);
    setOcrNote('');
    setVariantState(emptyVariantState);
    setPhase('idle');
  };

  const regenerateVariants = () => {
    if (!lastSubmission.current || !result || result.source !== 'ai' || !canGenerateVariants(result)) return;
    const credential = activeAiCredential();
    if (!credential) {
      setVariantState({
        status: 'error',
        variants: [],
        rejectedCount: 0,
        exhausted: true,
        message: '自定义 Key 未启用，无法生成变式。请先在「AI 设置」中填写并启用。',
      });
      return;
    }
    runVariantCollection(
      lastSubmission.current,
      result,
      [],
      credential,
      variantState.variants.map((variant) => variant.stem),
    );
  };

  const credential = activeAiCredential();
  const healthLabel = health === null
    ? '正在检查 AI 配置…'
    : aiSettings.mode === 'custom'
      ? aiSettings.enabled
        ? aiSettings.status === 'connected'
          ? '自定义 Key · 连接成功'
          : aiSettings.status === 'invalid'
            ? '自定义 Key · 需要检查'
            : aiSettings.status === 'error'
              ? '自定义 Key · 连接未完成'
              : '自定义 Key · 已启用'
        : '自定义 Key · 未启用'
      : health.ai
        ? `站点 AI 已配置${health.model ? ` · ${health.model}` : ''}`
        : health.customKeyReady
          ? '站点默认 Key 未配置 · 可填自己的 Key'
          : 'AI 未配置 · 内置 12 题仍可离线诊断';
  const healthOn = (aiSettings.mode === 'site' && health?.ai === true)
    || (aiSettings.mode === 'custom' && aiSettings.status === 'connected');

  const toggleAiSettings = () => {
    setAiSettingsOpen((open) => {
      if (!open) {
        checkAiHealth().then((value) => setHealth(value));
      }
      return !open;
    });
  };

  const credentialIssue = failure !== null && credentialFailureCodes.has(failure.code);

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
        <div className="freeform-status-group">
          <span className={`freeform-status${healthOn ? ' is-on' : ''}`}>
            <i className="status-dot" />
            {healthLabel}
          </span>
          <button
            type="button"
            className="freeform-ai-entry"
            data-testid="ai-settings-trigger"
            aria-expanded={aiSettingsOpen}
            aria-controls="ai-settings"
            onClick={toggleAiSettings}
          >
            <Settings2 aria-hidden="true" />
            AI 设置
            <small>{aiSettings.mode === 'custom' ? (aiSettings.enabled ? '自定义' : '未启用') : '站点配置'}</small>
          </button>
        </div>
      </div>

      <AiSettings
        open={aiSettingsOpen}
        health={health}
        onClose={() => setAiSettingsOpen(false)}
      />

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
            credential={credential}
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
            <small>站点默认 Key 只存在服务端；自定义 Key 只存在本页内存，调用时经本站后端转发。</small>
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
          <div className={`freeform-error${credentialIssue ? ' is-config' : ''}`} role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>{credentialIssue ? 'AI 凭证需要处理' : '本次诊断没有完成'}</strong>
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
                {credentialIssue && (
                  <button type="button" className="outline-button" onClick={toggleAiSettings}>
                    <Settings2 aria-hidden="true" />打开 AI 设置
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
          <FreeformResultView
            result={result}
            studentAnswer={lastSubmission.current?.finalAnswer ?? finalAnswer}
            variantPractice={result.source === 'ai' && canGenerateVariants(result)
              ? (
                <VariantPractice
                  state={variantState}
                  originalDiagnosis={result}
                  credential={credential}
                  onRetry={regenerateVariants}
                />
              )
              : undefined}
          />
        )}
      </div>

      <FreeformRecords
        records={records}
        summary={summarizeDiagnoses(records)}
        onClear={() => setRecords([])}
      />

      <div className="freeform-footer">
        <p>任意题诊断与图片识别需要联网；内置 12 题和上方比较演示仍可离线运行。</p>
        <span>AI 自评置信度 ≠ 已核验</span>
      </div>
    </section>
  );
}
