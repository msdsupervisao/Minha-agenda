export function notificationIdForScheduleCode(code: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % 2_147_483_000 + 1;
}
