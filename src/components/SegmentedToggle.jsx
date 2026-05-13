export default function SegmentedToggle({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      {label ? (
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      ) : null}
      <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={
                "px-3 py-1.5 text-sm rounded transition-colors " +
                (active
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-600 hover:text-gray-900")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
