import { ArrowUpRight, Clock3 } from 'lucide-react';
import {
  getGroupDifficulty,
  getGroupMinutes,
  practiceGroups,
  type PracticeGroup,
} from '../../data/practiceGroups';
import TextRoll from '../TextRoll';

export default function GroupPicker({
  activeGroupId,
  onSelect,
}: {
  activeGroupId: string | null;
  onSelect: (group: PracticeGroup) => void;
}) {
  return (
    <div className="practice-groups" data-lenis-prevent aria-label="选择练习题组">
      {practiceGroups.map((group, index) => {
        const active = activeGroupId === group.id;
        return (
          <button
            type="button"
            key={group.id}
            data-testid={`group-${group.id}`}
            className={`practice-group roll-trigger${active ? ' is-active' : ''}`}
            onClick={() => onSelect(group)}
            aria-pressed={active}
          >
            <span className="practice-group__top">
              <span>{String(index + 1).padStart(2, '0')} / {group.english}</span>
              <ArrowUpRight aria-hidden="true" />
            </span>
            <strong><TextRoll text={group.title} /></strong>
            <span className="practice-group__description">{group.description}</span>
            <span className="practice-group__meta">
              <span>{group.questionIds.length} 题 · {getGroupDifficulty(group)}</span>
              <span><Clock3 aria-hidden="true" />预计 {getGroupMinutes(group)} 分钟</span>
            </span>
            <span className="practice-group__action">{active ? '重新开始本题组' : '开始这一组'}</span>
          </button>
        );
      })}
    </div>
  );
}
