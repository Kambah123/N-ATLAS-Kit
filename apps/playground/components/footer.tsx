import { ATTRIBUTION, MODEL_CREDIT, PRIVACY_NOTE } from '@/lib/languages';

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--bg-elev)] px-4 py-5 text-xs leading-5 text-[var(--muted)] sm:px-6">
      <p className="max-w-3xl text-[var(--ink)]">{ATTRIBUTION}</p>
      <p className="mt-2 max-w-3xl">{MODEL_CREDIT}</p>
      <p className="mt-2 max-w-3xl">
        The models are released under Awarri&apos;s Open-Source Research and Innovation License, not
        Apache-2.0. Attribution is required, public use is capped at 1,000 active end-users in any
        rolling 30 days, and commercial deployment needs a separate agreement. This
        playground&apos;s code is Apache-2.0. See the model cards on{' '}
        <a
          className="underline decoration-[var(--gold-line)] underline-offset-2"
          href="https://huggingface.co/NCAIR1/N-ATLaS"
        >
          Hugging Face
        </a>
        .
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <span>{PRIVACY_NOTE}</span>
        <span>Built by OneDev Studioo.</span>
      </p>
    </footer>
  );
}
