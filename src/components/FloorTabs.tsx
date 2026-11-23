interface Props {
  value: number
  onChange: (i: number) => void
}

export function FloorTabs({ value, onChange }: Props) {
  return (
    <div
      className="mt-2.5 inline-flex gap-0.5 rounded-[10px] bg-surface2 p-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      {['1F', '2F'].map((label, i) => (
        <button
          key={label}
          type="button"
          aria-pressed={value === i}
          onClick={() => onChange(i)}
          className={`min-h-9 min-w-12 cursor-pointer rounded-lg border-0 px-3 py-1 text-[14px] ${
            value === i ? 'bg-btn font-bold text-btn-ink' : 'bg-transparent font-medium text-ink2'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
