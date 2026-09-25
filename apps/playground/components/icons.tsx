type IconProps = { className?: string };

function base(className?: string) {
  return className ?? 'h-5 w-5';
}

export function IconChat({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 16.5 4.2 19.2A1 1 0 0 1 3 18.4V7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v6.5A2.5 2.5 0 0 1 18.5 16.5H6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function IconMic({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3.5" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5M9 20.5h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCode({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconDocs({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3.5h7l5 5V20.5H7A2 2 0 0 1 5 18.5v-13A2 2 0 0 1 7 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M14 3.5V9h5.5M8.5 13h7M8.5 16.5h5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function IconGitHub({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.1-1.47-1.1-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.94.36.31.68.92.68 1.86v2.76c0 .26.18.58.69.48A10 10 0 0 0 12 2.2Z" />
    </svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.725-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export function IconPaperclip({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m8.5 12.5 6.2-6.2a3 3 0 0 1 4.2 4.2l-7.6 7.6a4.2 4.2 0 0 1-6-6l7.1-7.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15.5 3.5a8.2 8.2 0 1 0 5 12.2A7.2 7.2 0 0 1 15.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Mark({ className }: IconProps) {
  return (
    <svg className={className ?? 'h-7 w-7'} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#073326" />
      <path fill="#f6f3ea" d="M8.2 23V9h3.2l4.2 8.5V9H19v14h-3.2l-4.3-8.7V23H8.2z" />
      <circle cx="24.2" cy="22.8" r="2" fill="#c6a15b" />
    </svg>
  );
}
