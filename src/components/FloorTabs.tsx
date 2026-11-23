interface Props {
  value: number
  onChange: (i: number) => void
}

export function FloorTabs({ value, onChange }: Props) {
  return (
    <div
      className="mt-2.5 flex gap-4"
      onClick={(e) => e.stopPropagation()}
    >
      {['1F', '2F'].map((label, i) => (
        <button
          key={label}
          type="button"
          aria-pressed={value === i}
          onClick={() => onChange(i)}
          className={`min-h-9 cursor-pointer rounded-none border-0 border-b-2 bg-transparent px-0.5 py-1 font-serif text-[14px] tracking-[.08em] ${
            value === i ? 'border-accent font-bold text-ink' : 'border-transparent text-ink2'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
