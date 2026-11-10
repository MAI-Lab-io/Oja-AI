export function formatArtifactSize(size: number) {
  if (size < 1024) return `${size} B`
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3)
  return `${(size / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`
}
