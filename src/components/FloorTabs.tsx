interface Props {
  value: number
  onChange: (i: number) => void
}

export function FloorTabs({ value, onChange }: Props) {
  return (
    <div
      className="mt-2.5 flex gap-1.5"
      onClick={(e) => e.stopPropagation()}
      // 親カード（role=button）の Enter/Space 開閉にタブ操作のキーが伝わらないようにする
      onKeyDown={(e) => e.stopPropagation()}
    >
      {['1F', '2F'].map((label, i) => (
        <button
          key={label}
          type="button"
          aria-pressed={value === i}
          onClick={() => onChange(i)}
          className={`min-h-9 cursor-pointer rounded-[7px] border px-3.5 py-1 text-[12.5px] font-bold ${
            value === i ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink2'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
