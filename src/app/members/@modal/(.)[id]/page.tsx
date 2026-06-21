import RouteModal from "@/components/route-modal";
import MemberDetailPage from "@/app/members/[id]/page";

/**
 * /members 에서 /members/[id] 로 소프트 내비게이션 시 이 라우트가 가로채
 * 프로필 페이지 본문을 모달로 띄운다. (전체 페이지와 동일한 서버 렌더 재사용)
 */
export default async function InterceptedMemberProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <RouteModal>
      <MemberDetailPage params={params} searchParams={Promise.resolve({})} />
    </RouteModal>
  );
}
