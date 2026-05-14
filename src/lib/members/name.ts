/**
 * 회원 명단 표시용 이름 포맷.
 * 두 글자 이름은 사이에 전각 공백(　, 1em)을 넣어 3글자 폭으로 보이게 함.
 *   "이준" → "이　준"
 */
export function displayMemberName(name: string): string {
  const n = name.trim();
  return n.length === 2 ? `${n[0]}　${n[1]}` : n;
}
