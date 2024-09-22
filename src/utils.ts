export function getRandomName(): string {
  return Math.random().toString(36).split(".")[1] as string;
}
