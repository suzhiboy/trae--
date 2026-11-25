export default function TextRoll({ text }: { text: string }) {
  return (
    <span className="text-roll">
      <span className="practice-sr-only">{text}</span>
      <span className="text-roll__inner" aria-hidden="true">
        {text.split('').map((character, index) => (
          <span className="text-roll__char" key={`${character}-${index}`}>
            <span className="text-roll__track" style={{ transitionDelay: `${index * 15}ms` }}>
              <span>{character === ' ' ? ' ' : character}</span>
              <span>{character === ' ' ? ' ' : character}</span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
