/**
 * 회원 섹션 레이아웃 — @modal 병렬 슬롯을 추가해
 * 회원명단(/members)에서 프로필(/members/[id])을 모달로 가로채 띄운다.
 * (직접 진입·새로고침 시엔 가로채지 않고 전체 페이지 렌더)
 */
export default function MembersLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
