'use client'

/**
 * The app's switch control. Extracted from the Settings page so the push prompt
 * in a group chat renders the exact same control rather than a lookalike.
 */
export default function Toggle({
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${value ? 'bg-brand-blue' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )
}
