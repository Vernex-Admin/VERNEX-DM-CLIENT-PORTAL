// Shared look for Input, Textarea and Select. 16px text on mobile stops iOS zooming on focus.
export const controlClasses =
  'w-full rounded-field border border-rule bg-surface px-3 text-[16px] text-ink placeholder:text-ink-muted ' +
  'transition-colors duration-150 enabled:hover:border-ink-muted aria-invalid:border-bad ' +
  'disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-muted sm:text-[1rem]'

export const controlHeight = 'min-h-[44px] lg:min-h-[36px]'
