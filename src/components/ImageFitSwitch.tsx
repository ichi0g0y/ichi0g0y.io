export type ImageFitSwitchProps = {
  checked: boolean
  onCheckedChange: (nextChecked: boolean) => void
}

export function ImageFitSwitch({ checked, onCheckedChange }: ImageFitSwitchProps) {
  return (
    <button
      className={`image-fit-switch${checked ? ' is-on' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="image-fit-switch-thumb" aria-hidden="true" />
    </button>
  )
}
