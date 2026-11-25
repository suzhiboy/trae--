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
