import { ATTRIBUTION, MODEL_CREDIT, PRIVACY_NOTE } from '@/lib/languages';

const STUDIO_HREF = 'https://www.onedevstudioo.site/';
const X_HREF = 'https://x.com/0xSkamber';

const linkClass =
  'underline decoration-[var(--gold-line)] underline-offset-2 hover:text-[var(--ink)]';

export function SiteFooter() {
  return (
    <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--bg-elev)] px-4 py-2 text-xs leading-4 text-[var(--muted)] sm:px-6">
      <p className="text-[var(--ink)]">{ATTRIBUTION}</p>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <span>{PRIVACY_NOTE}</span>
        <a className={linkClass} href={STUDIO_HREF} target="_blank" rel="noopener">
          Built by OneDev Studioo
        </a>
        <a className={linkClass} href={X_HREF} target="_blank" rel="noopener">
          X @0xSkamber
        </a>
      </p>
      <details className="mt-1">
        <summary className="w-fit cursor-pointer rounded-md px-1 text-[var(--ink)]">
          About / license
        </summary>
        <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1 pb-1 leading-5">
          <p className="max-w-3xl">{MODEL_CREDIT}</p>
          <p className="max-w-3xl">
            The models are released under Awarri&apos;s Open-Source Research and Innovation License,
            not Apache-2.0. Attribution is required, public use is capped at 1,000 active end-users
            in any rolling 30 days, and commercial deployment needs a separate agreement. This
            playground&apos;s code is Apache-2.0. See the model cards on{' '}
            <a
              className="underline decoration-[var(--gold-line)] underline-offset-2"
              href="https://huggingface.co/NCAIR1/N-ATLaS"
            >
              Hugging Face
            </a>
            .
          </p>
        </div>
      </details>
    </footer>
  );
}
