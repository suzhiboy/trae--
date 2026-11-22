function RollingCharacter({ character }: { character: string }) {
  if (!/^\d$/.test(character)) return <span aria-hidden="true">{character}</span>;
  return (
    <span className="rolling-digit" aria-hidden="true">
      <span className="rolling-digit__track" style={{ transform: `translateY(-${Number(character)}em)` }}>
        {Array.from({ length: 10 }, (_, digit) => <span key={digit}>{digit}</span>)}
      </span>
    </span>
  );
}

export function RollingText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`rolling-text ${className}`} aria-label={text}>
      {text.split('').map((character, index) => <RollingCharacter key={index} character={character} />)}
    </span>
  );
}

export function RollingNumber({ value, pad = 4, className = '' }: { value: number; pad?: number; className?: string }) {
  return <RollingText text={Math.max(0, Math.round(value)).toString().padStart(pad, '0')} className={className} />;
}
