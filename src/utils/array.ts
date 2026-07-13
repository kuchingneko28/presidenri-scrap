export function addUnique(arr: string[], value: string): void {
  if (value && !arr.includes(value)) arr.push(value);
}
