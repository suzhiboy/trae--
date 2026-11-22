export interface Question {
  id: string;
  stem: string;
  correctAnswer: string;
  subject: string;
  difficulty: string;
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
