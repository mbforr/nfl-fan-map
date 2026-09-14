// Copy of src/components/SegmentedToggle.jsx, extended with per-option
// `disabled` + `title`. The density app needs that for the Moran/scope interlock;
// copying 31 lines keeps the shared component free of regression risk.

export default function SegmentedToggle({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      {label ? (
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      ) : null}
      <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
        {options.map((opt) => {
          const active = opt.value === value;
          const disabled = !!opt.disabled && !active;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={disabled}
              disabled={disabled}
              title={opt.title || undefined}
              onClick={() => !disabled && onChange(opt.value)}
              className={
                "px-3 py-1.5 text-sm rounded transition-colors " +
                (active
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : disabled
                    ? "text-gray-300 cursor-not-allowed"
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
