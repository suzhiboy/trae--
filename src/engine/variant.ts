import type {
  FreeformVariantCandidate,
  VerifiedFreeformVariant,
} from '../types';
import { checkQuestionAnswer } from './calcVerifiers';
import { normalizeAnswer } from './normalize';

/**
 * 变式候选的本地复算闸门。
 * 只有能从题干独立算出、且与候选答案一致的题才允许展示；
 * 算不出或算错的一律丢弃，由调用方补充生成。
 */

export interface RejectedVariant {
  candidate: FreeformVariantCandidate;
  detail: string;
  expected: string | null;
}

export interface CollectVariantOptions {
  /** 需要凑齐的变式数量，默认 2。 */
  target?: number;
  /** 最多请求几轮，默认 2（首轮 + 一次补生成）。 */
  maxRounds?: number;
  /** 已经出现过的题干，避免重复生成。 */
  excludeStems?: string[];
  verify?: (candidate: FreeformVariantCandidate) => VerifiedFreeformVariant | RejectedVariant;
}

export interface CollectVariantResult {
  verified: VerifiedFreeformVariant[];
  rejected: RejectedVariant[];
  rounds: number;
  exhausted: boolean;
  /** 补充生成请求失败时的提示；已有通过复算的题仍会返回。 */
  requestError: string | null;
}

export function normalizeVariantStem(stem: string): string {
  return normalizeAnswer(stem)
    .replace(/[\s，,。；;：:、？?！!"'“”‘’（）()【】[\]]/g, '');
}

function verified(
  candidate: FreeformVariantCandidate,
  expected: string | null,
  detail: string,
  kind: VerifiedFreeformVariant['verification']['kind'],
  id: string,
): VerifiedFreeformVariant {
  return {
    id,
    stem: candidate.stem.trim(),
    answer: candidate.answer.trim(),
    verification: { status: 'verified', expected, detail, kind },
  };
}

function rejected(
  candidate: FreeformVariantCandidate,
  detail: string,
  expected: string | null,
): RejectedVariant {
  return {
    candidate: { stem: candidate.stem.trim(), answer: candidate.answer.trim() },
    detail,
    expected,
  };
}

/** 对单个候选做独立复算；不依赖模型自评。 */
export function verifyVariantCandidate(
  candidate: FreeformVariantCandidate,
): VerifiedFreeformVariant | RejectedVariant {
  const stem = candidate.stem.trim();
  const answer = candidate.answer.trim();
  if (!stem || !answer) {
    return rejected(candidate, '变式缺少题干或答案，已丢弃。', null);
  }

  const check = checkQuestionAnswer(stem, [], answer);
  if (check.status === 'verified') {
    return verified(candidate, check.expected, check.detail, check.kind, '');
  }
  if (check.status === 'conflict') {
    return rejected(
      candidate,
      `本地复算得到 ${check.expected ?? '不同结果'}，与候选答案「${answer}」不一致，已丢弃。`,
      check.expected,
    );
  }
  return rejected(
    candidate,
    '这道变式不属于本地可独立复算的题型，未展示。',
    check.expected,
  );
}

/**
 * 逐轮收集变式：复算通过才保留，不通过就带上已用题干请求补充。
 * request 由调用方注入（真实网络或测试桩）；网络错误直接抛出，由上层提示。
 */
export async function collectVerifiedVariants(
  request: (round: number, excludeStems: string[]) => Promise<FreeformVariantCandidate[]>,
  options: CollectVariantOptions = {},
): Promise<CollectVariantResult> {
  const target = Math.max(1, Math.min(4, Math.floor(options.target ?? 2)));
  const maxRounds = Math.max(1, Math.floor(options.maxRounds ?? 2));
  const verify = options.verify ?? verifyVariantCandidate;
  const seen = new Set((options.excludeStems ?? []).map(normalizeVariantStem).filter(Boolean));
  const usedStems: string[] = [...(options.excludeStems ?? [])];
  const verifiedList: VerifiedFreeformVariant[] = [];
  const rejectedList: RejectedVariant[] = [];
  let rounds = 0;
  let requestError: string | null = null;

  for (let round = 0; round < maxRounds && verifiedList.length < target; round += 1) {
    rounds = round + 1;
    let candidates: FreeformVariantCandidate[];
    try {
      candidates = await request(round, [...usedStems]);
    } catch (error) {
      requestError = error instanceof Error ? error.message : '变式生成请求失败';
      break;
    }
    for (const raw of candidates) {
      if (verifiedList.length >= target) break;
      const candidate = {
        stem: typeof raw?.stem === 'string' ? raw.stem.trim() : '',
        answer: typeof raw?.answer === 'string' ? raw.answer.trim() : '',
      };
      const key = normalizeVariantStem(candidate.stem);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      usedStems.push(candidate.stem);

      const outcome = verify(candidate);
      if ('verification' in outcome) {
        verifiedList.push({
          ...outcome,
          id: `variant-${verifiedList.length + 1}`,
        });
      } else {
        rejectedList.push(outcome);
      }
    }
  }

  return {
    verified: verifiedList,
    rejected: rejectedList,
    rounds,
    exhausted: verifiedList.length < target,
    requestError,
  };
}
