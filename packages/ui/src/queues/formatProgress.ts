export function formatProgress(progress: number | object): string {
  return typeof progress === 'number' ? `${progress}%` : JSON.stringify(progress);
}
