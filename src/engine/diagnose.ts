import { knowledgeEdges, knowledgeNodes, questions } from '../data/knowledge';
import { questionRules } from '../data/practiceRules';
import type { DiagnosisResult, QuestionRule } from '../types';
import { normalizeAnswer } from './normalize';

const nodeIds = new Set(knowledgeNodes.map((node) => node.id));
const nodeLabels = new Map(knowledgeNodes.map((node) => [node.id, node.label]));
const prerequisiteIds = new Map(knowledgeNodes.map((node) => [node.id, [] as string[]]));

for (const edge of knowledgeEdges) {
  if (prerequisiteIds.has(edge.target) && nodeIds.has(edge.source)) {
    prerequisiteIds.get(edge.target)?.push(edge.source);
  }
}

export function buildLearningPath(weakNodeIds: string[]): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      throw new Error(`知识图谱存在循环依赖：${nodeId}`);
    }

    visiting.add(nodeId);
    for (const prerequisiteId of prerequisiteIds.get(nodeId) ?? []) {
      visit(prerequisiteId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    path.push(nodeId);
  }

  for (const nodeId of weakNodeIds) {
    if (nodeIds.has(nodeId)) visit(nodeId);
  }

  return path;
}

function correctResult(rule: QuestionRule): DiagnosisResult {
  return {
    isCorrect: true,
    source: 'rules',
    reason: '答案正确，暂未发现本题相关薄弱点',
    evidence: rule.correctEvidence,
    weakNodeIds: [],
    learningPathIds: [],
    steps: [
      '保留本次解题过程，作为同类题的复习样例。',
      '改变题目中的一个数字再做一遍，检查方法是否稳定。',
      '继续用逆运算或代回验算，本题不需要生成薄弱知识点。',
    ],
    confidence: 'high',
  };
}

function unknownResult(rule?: QuestionRule): DiagnosisResult {
  const targetLabel = rule ? nodeLabels.get(rule.targetNodeId) : undefined;
  return {
    isCorrect: false,
    source: 'rules',
    reason: '暂时无法准确判断错误根因',
    evidence: rule
      ? '当前答案未匹配本题已知的典型错误模式。请补充中间解题步骤，避免仅凭一个陌生错答推断确定错因。'
      : '本地题库中未找到该题目，无法使用已有规则诊断。请选择题库中的题目或补充更多题目信息。',
    weakNodeIds: [],
    learningPathIds: rule ? buildLearningPath([rule.targetNodeId]) : [],
    steps: rule
      ? [
          '先核对原题和答案，确认没有漏写符号、系数或常数项。',
          `可以检查「${targetLabel}」，但这只是复习方向，并不表示已确认该知识点薄弱。`,
          '写出至少一步中间过程后重新诊断，以便缩小错误原因。',
        ]
      : [
          '请核对题目是否已加入本地题库，以及题目编号是否正确。',
          '写出完整的题目和关键解题步骤，避免信息不足。',
          '将题目和步骤交给老师进一步检查，不把当前结果视为确定的知识漏洞。',
        ],
    confidence: 'low',
  };
}

export function diagnose(questionId: string, studentAnswer: string): DiagnosisResult {
  const question = questions.find((item) => item.id === questionId);
  const rule = question ? questionRules[questionId] : undefined;
  if (!rule) return unknownResult();

  const normalizedAnswer = normalizeAnswer(studentAnswer);
  if (rule.correctAnswers.includes(normalizedAnswer)) {
    return correctResult(rule);
  }

  const pattern = rule.errorPatterns.find((item) => item.answers.includes(normalizedAnswer));
  if (!pattern) {
    return unknownResult(rule);
  }

  const weakNodeIds = [pattern.weakNodeId];
  return {
    isCorrect: false,
    source: 'rules',
    reason: pattern.reason,
    evidence: pattern.evidence,
    weakNodeIds,
    learningPathIds: buildLearningPath(weakNodeIds),
    steps: [...pattern.steps],
    confidence: 'medium',
  };
}
