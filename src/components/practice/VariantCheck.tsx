import { useRef, type Dispatch, type KeyboardEvent } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import type { PracticeAction, PracticeDraft } from '../../hooks/usePracticeSession';
import type { ErrorPattern } from '../../types';

export default function VariantCheck({
  questionId,
  pattern,
  draft,
  dispatch,
}: {
  questionId: string;
  pattern: ErrorPattern;
  draft: PracticeDraft;
  dispatch: Dispatch<PracticeAction>;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const selected = pattern.variant.options.find((option) => option.id === draft.selectedVariantOptionId);
  const attemptLabel = draft.variantAttempts <= 1 ? '首次作答' : `第 ${draft.variantAttempts} 次尝试`;

  const moveSelection = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + direction + pattern.variant.options.length) % pattern.variant.options.length;
    const option = pattern.variant.options[nextIndex];
    dispatch({ type: 'SELECT_VARIANT', optionId: option.id });
    inputs.current[nextIndex]?.focus();
  };

  return (
    <fieldset className="practice-variant" data-testid="practice-variant-panel">
      <legend><RotateCcw aria-hidden="true" />变式验证</legend>
      <p className="practice-variant__stem">{pattern.variant.stem}</p>
      <div className="practice-variant__options" role="radiogroup" aria-label="变式题选项">
        {pattern.variant.options.map((option, index) => (
          <label
            key={option.id}
            className={`practice-variant__option${draft.selectedVariantOptionId === option.id ? ' is-selected' : ''}`}
            htmlFor={`variant-${questionId}-${option.id}`}
          >
            <input
              id={`variant-${questionId}-${option.id}`}
              ref={(element) => { inputs.current[index] = element; }}
              data-testid={`variant-option-${option.id}`}
              type="radio"
              name={`variant-${questionId}`}
              value={option.id}
              checked={draft.selectedVariantOptionId === option.id}
              onChange={() => dispatch({ type: 'SELECT_VARIANT', optionId: option.id })}
              onKeyDown={(event) => moveSelection(event, index)}
            />
            <span className="practice-variant__letter">{option.id.toUpperCase()}</span>
            <span>{option.text}</span>
          </label>
        ))}
      </div>
      {selected && (
        <div className={`practice-variant__result${draft.verification === 'corrected' ? ' is-corrected' : ''}`} role="status">
          {draft.verification === 'corrected' ? (
            <><CheckCircle2 aria-hidden="true" /><strong>本次变式答对</strong><small>{attemptLabel}</small><p>{selected.explanation}</p></>
          ) : (
            <><strong>仍需复习</strong><small>{attemptLabel}</small><p>{selected.explanation}</p></>
          )}
          <p className="practice-variant__caveat">一次变式只验证这一次作答，不据此推断长期掌握。</p>
        </div>
      )}
    </fieldset>
  );
}
