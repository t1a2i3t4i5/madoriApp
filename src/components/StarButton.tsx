interface Props {
  starred: boolean
  onToggle: () => void
  className?: string
}

/** お気に入りの☆ボタン。親（カード）の開閉操作に伝わらないよう click を止める */
export function StarButton({ starred, onToggle, className = '' }: Props) {
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? 'お気に入りから外す' : 'お気に入りに追加'}
      title={starred ? 'お気に入りから外す' : 'お気に入りに追加'}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={`size-10 cursor-pointer rounded-none border-0 bg-transparent text-xl leading-none ${starred ? 'text-accent' : 'text-ink2'} ${className}`}
    >
      {starred ? '★' : '☆'}
    </button>
  )
}
