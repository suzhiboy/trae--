export default function StudentIdField({
  value,
  onChange,
  label = '学生编号',
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <label className="student-id-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="例如 2026001"
        maxLength={40}
        autoComplete="off"
        spellCheck={false}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
