export interface Question {
  id: string;
  stem: string;
  correctAnswer: string;
  subject: string;
  difficulty: string;
  module: string;
  estimatedSeconds: number;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  description: string;
  group: string;
}

export interface KnowledgeEdge {
  source: string;
  target: string;
}

export interface DiagnosisResult {
  isCorrect: boolean;
  source: 'rules' | 'ai';
  reason: string;
  evidence: string;
  weakNodeIds: string[];
  learningPathIds: string[];
  steps: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface VariantOption {
  id: string;
  text: string;
  explanation: string;
}

export interface ErrorVariant {
  stem: string;
  options: VariantOption[];
  correctOptionId: string;
}

export interface ErrorPattern {
  id: string;
  answers: string[];
  stepSignatures: string[];
  weakNodeId: string;
  reason: string;
  evidence: string;
  /** 有草稿步骤可引用时使用的证据，避免把“仅凭答案猜测”的措辞带进高置信度结论。 */
  stepEvidence?: string;
  correction: string;
  steps: [string, string, string];
  variant: ErrorVariant;
  /** 只有学生停在该中间结果、没有继续完成运算时才构成错误。 */
  terminalOnly?: boolean;
  /** 仅凭答案产生歧义时，用来区分原因的追问。 */
  probe?: string;
}

/** 代入求值题中，期望出现的各项及其符号错误对应的模式。 */
export interface SubstitutionTermModel {
  value: number;
  label: string;
  patternId: string;
  hint: string;
}

export interface FunctionSubstitutionModel {
  kind: 'function-substitution';
  /** 例如 f(-1)，用于识别学生的代入行。 */
  left: string;
  terms: SubstitutionTermModel[];
  expectedValue: number;
  arithmeticPatternId: string;
  arithmeticHint: string;
}

export interface QuestionRule {
  targetNodeId: string;
  correctAnswers: string[];
  correctEvidence: string;
  errorPatterns: ErrorPattern[];
  stepModel?: FunctionSubstitutionModel;
}

export type AttemptStatus = 'correct' | 'diagnosed' | 'process-error' | 'unknown';

export interface AttemptDiagnosis extends DiagnosisResult {
  status: AttemptStatus;
  /** 明确不成立的步骤；漏做最后一步等“中间步骤正确”的情况为 null。 */
  firstWrongStepIndex: number | null;
  /** 需要学生查看的步骤；可与 firstWrongStepIndex 相同，也可指向正确的中间步骤。 */
  focusStepIndex: number | null;
  /** 被引用学生原句，便于手机端直接核对。 */
  stepQuote: string | null;
  matchedPatternId: string | null;
  correctedStep: string | null;
  /** 仅凭最终答案时列出的可能原因，不据此确认薄弱点。 */
  alternativePatternIds: string[];
  /** 区分可能原因的具体追问。 */
  probe: string | null;
  /** 结果正确但过程有误时的并列提示。 */
  processNote: string | null;
}

export interface DiagnoseAttemptInput {
  questionId: string;
  finalAnswer: string;
  steps: string[];
}

export type PracticeAttemptKind = 'answered' | 'skipped' | 'unanswered';
export type VerificationStatus = 'not-required' | 'pending' | 'corrected' | 'needs-review';

export interface PracticeAttempt {
  questionId: string;
  kind: PracticeAttemptKind;
  finalAnswer: string;
  steps: string[];
  elapsedSeconds: number;
  diagnosis: AttemptDiagnosis | null;
  verification: VerificationStatus;
  selectedVariantOptionId: string | null;
  /** 变式实际尝试次数，用于区分首次答对与重试后答对。 */
  variantAttempts: number;
}

export interface SessionReport {
  total: number;
  answered: number;
  correct: number;
  diagnosed: number;
  processError: number;
  unknown: number;
  skipped: number;
  accuracy: number;
  averageSeconds: number;
  weakNodeIds: string[];
  learningPathIds: string[];
  attempts: PracticeAttempt[];
}

/* ---------- 任意题诊断：AI 理解 + 本地复算 ---------- */

export type VerificationState = 'verified' | 'conflict' | 'unverified';

/** 每次 AI 请求显式选择凭证；自定义 Key 只存在于当前页面内存。 */
export type AiCredentialMode = 'site' | 'custom';

/** 供应商协议：名称、模型和协议是三个独立配置。 */
export type AiProtocol = 'openai' | 'anthropic';

/** 服务端公开的供应商信息；不包含任何 Key 或用户凭证。 */
export interface AiProviderInfo {
  id: string;
  label: string;
  protocol: AiProtocol;
  /** 实际接收请求的域名。 */
  domain: string;
  /** Base URL 的路径前缀，例如 /v1 或 /api/v3。 */
  basePath: string;
  textModels: string[];
  visionModels: string[];
  suggestedTextModels: string[];
  suggestedVisionModels: string[];
  siteKey: boolean;
  customKey: boolean;
  isDefault: boolean;
}

export interface AiCredentialBase {
  providerId?: string;
  providerLabel?: string;
  protocol?: AiProtocol;
  textModel?: string;
  visionModel?: string;
  revision?: number;
}

/** 兼容旧调用：只描述站点/自定义模式与 Key。 */
export type AiCredential =
  | (AiCredentialBase & { mode: 'site' })
  | (AiCredentialBase & { mode: 'custom'; apiKey: string });

/** 新请求使用的完整快照；revision 用于丢弃切换设置后才返回的旧结果。 */
export type AiRequestCredential =
  | (AiCredentialBase & { mode: 'site'; revision: number })
  | (AiCredentialBase & { mode: 'custom'; apiKey: string; revision: number });

/** 变式候选；答案必须通过本地复算后才允许展示。 */
export interface FreeformVariantCandidate {
  stem: string;
  answer: string;
}

/** 已通过独立复算的变式。 */
export interface VerifiedFreeformVariant {
  id: string;
  stem: string;
  answer: string;
  verification: {
    status: 'verified';
    expected: string | null;
    detail: string;
    kind: 'function' | 'equation' | 'sequence' | 'set' | 'arithmetic' | null;
  };
}

/** 变式答错后再诊断时，与原错因的关系。 */
export type VariantErrorVerdict = 'same-error' | 'different-error' | 'undetermined';

/** 不绑定内置题库的诊断记录，用于会话汇总、CSV 与教师视图。 */
export interface DiagnosisRecord {
  id: string;
  createdAt: number;
  source: 'rules' | 'ai';
  question: string;
  finalAnswer: string;
  /** 命中内置题时保留题号；任意题为 null。 */
  questionId: string | null;
  /** 命中内置错因模式时保留模式号；任意题为 null。 */
  patternId: string | null;
  status: AttemptStatus;
  reason: string;
  knowledgePoint: string;
  knowledgeNodeId: string | null;
  weakNodeIds: string[];
  verification: FreeformVerification['conclusion'] | null;
}

export interface DiagnosisSummary {
  total: number;
  correct: number;
  diagnosed: number;
  processError: number;
  unknown: number;
  weakNodeIds: string[];
  weakKnowledgePoints: string[];
  learningPathIds: string[];
}

export type ClaimKind = 'arithmetic' | 'equation' | 'set' | 'answer' | 'quote';

/** 模型自己声明“这条结论可被独立复算”。 */
export interface AiClaim {
  kind: ClaimKind;
  expression: string;
  claimed: string;
}

/** 服务端严格校验后返回的模型结果。 */
export interface FreeformAiResult {
  correctAnswer: string;
  standardSteps: string[];
  /** 1 起的学生步骤序号；没有错误步骤为 null。 */
  firstWrongStepIndex: number | null;
  stepQuote: string;
  reason: string;
  knowledgePoint: string;
  knowledgeNodeId: string | null;
  variant: { stem: string; answer: string };
  /** 2-3 个候选变式，仍需本地复算后才展示；旧服务端可能只返回 variant。 */
  variants?: FreeformVariantCandidate[];
  confidence: 'high' | 'medium' | 'low';
  claims: AiClaim[];
  insufficientEvidence: boolean;
  uncertainty: string;
}

export interface VerifiedClaim {
  kind: ClaimKind | 'standard-step' | 'student-step' | 'final-answer' | 'index';
  expression: string;
  claimed: string;
  recomputed: string | null;
  status: VerificationState;
  detail: string;
}

export interface FreeformVerification {
  claims: VerifiedClaim[];
  verifiedCount: number;
  conflictCount: number;
  unverifiedCount: number;
  conclusion: 'consistent' | 'partial' | 'conflict' | 'unverifiable' | 'insufficient';
}

/** 任意题入口的 AI 诊断展示模型。 */
export interface FreeformAiDiagnosis {
  source: 'ai';
  status: AttemptStatus;
  /** 采纳的正确答案；冲突时可能是本地复算值。 */
  correctAnswer: string;
  /** 模型原始给出的正确答案，用于对照。 */
  aiCorrectAnswer: string;
  standardSteps: string[];
  /** 0 起，供 UI 高亮；已通过引用原句校验。 */
  firstWrongStepIndex: number | null;
  stepQuote: string;
  reason: string;
  aiReason: string;
  knowledgePoint: string;
  knowledgeNodeId: string | null;
  variant: { stem: string; answer: string };
  confidence: 'high' | 'medium' | 'low';
  aiConfidence: 'high' | 'medium' | 'low';
  verification: FreeformVerification;
  uncertainty: string;
}

/** 命中内置题时，仍走原有规则诊断。 */
export interface FreeformRuleResult {
  source: 'rules';
  question: Question;
  diagnosis: AttemptDiagnosis;
}

export type FreeformResult = FreeformRuleResult | FreeformAiDiagnosis;

export interface OcrResult {
  question: string;
  finalAnswer: string;
  steps: string[];
  uncertainFields: string[];
  confidence: 'high' | 'medium' | 'low';
}
