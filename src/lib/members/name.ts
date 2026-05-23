/**
 * 회원 명단 표시용 이름 포맷.
 * 현재는 trim 후 그대로 반환 (콤팩트 표시 우선).
 */
export function displayMemberName(name: string): string {
  return name.trim();
}
