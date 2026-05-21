import LegalText from "@/components/legal-text";
import LegalBackButton from "@/components/legal-back-button";
import { TERMS_OF_SERVICE } from "@/lib/legal/documents";

export const metadata = {
  title: "이용약관 · 수아자FC",
};

export default function TermsPage() {
  return (
    <main className="flex-1 bg-white sm:bg-suaza-bg px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-[720px] mx-auto bg-white sm:rounded-2xl sm:p-10 sm:shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] flex flex-col gap-4">
        <LegalBackButton />
        <LegalText source={TERMS_OF_SERVICE} />
      </div>
    </main>
  );
}
