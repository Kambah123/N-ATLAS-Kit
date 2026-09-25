import { type AsrLanguage, type ChatLanguage } from '@/lib/types';

export type ChatLanguageOption = {
  id: ChatLanguage;
  label: string;
  endonym: string;
  /** Short hint shown under the selector. */
  blurb: string;
  /** Prepended as a system message. The gateway's `language` field is log-only. */
  system: string;
  placeholder: string;
  examples: readonly string[];
};

/**
 * System lines and examples for Hausa, Igbo, and Yorùbá are short on purpose.
 * Native-speaker review is welcome — see CONTRIBUTING.md.
 */
export const CHAT_LANGUAGE_OPTIONS: readonly ChatLanguageOption[] = [
  {
    id: 'en',
    label: 'English',
    endonym: 'English',
    blurb: 'Nigerian and international English.',
    system:
      'You are N-ATLaS, a multilingual assistant built for Nigeria. Reply in clear English unless the user asks for another language.',
    placeholder: 'Ask N-ATLaS something…',
    examples: [
      'Explain how to cook jollof rice, step by step.',
      'What is N-ATLaS, and who built it?',
      'Write a short welcome for a tech meetup in Lagos.',
    ],
  },
  {
    id: 'ha',
    label: 'Hausa',
    endonym: 'Hausa',
    blurb: 'The model replies in Hausa.',
    system:
      'Kai N-ATLaS ne, mataimaki mai harsuna da yawa na Najeriya. Amsa da Hausa sai dai idan mai amfani ya nemi wani harshe.',
    placeholder: 'Tambayi N-ATLaS…',
    examples: [
      'Sannu! Ka gaya mini yadda ake dafa jollof rice.',
      'Menene N-ATLaS, kuma yaya yake taimakawa masu haɓaka software?',
      'Rubuta gajeren labari game da Kano.',
    ],
  },
  {
    id: 'ig',
    label: 'Igbo',
    endonym: 'Igbo',
    blurb: 'The model replies in Igbo.',
    system:
      'Ị bụ N-ATLaS, onye enyemaka nke na-asụ ọtụtụ asụsụ na Naịjirịa. Zaa n’Igbo ma ọ bụrụ na onye ọrụ ahụghị asụsụ ọzọ.',
    placeholder: 'Jụọ N-ATLaS…',
    examples: [
      'Kedu ka e si esi jollof rice?',
      'Kọwaa ihe bụ N-ATLaS n’asụsụ Igbo.',
      'Dee ekene maka emume teknụzụ na Enugu.',
    ],
  },
  {
    id: 'yo',
    label: 'Yorùbá',
    endonym: 'Yorùbá',
    blurb: 'The model replies in Yorùbá.',
    system:
      'Ìwọ ni N-ATLaS, olùrànlọ́wọ́ onírúurú èdè fún Nàìjíríà. Dáhùn ní Yorùbá àyàfi tí olùbéèrè bá béèrè èdè mìíràn.',
    placeholder: 'Béèrè lọ́wọ́ N-ATLaS…',
    examples: [
      'Báwo ni a ṣe ń se jollof rice?',
      'Kíni N-ATLaS? Ṣàlàyé rẹ̀ ní Yorùbá.',
      'Kọ ìkíni kúkúrú fún ìpàdé ìmọ̀-ẹ̀rọ ní Ìbàdàn.',
    ],
  },
  {
    id: 'pcm',
    label: 'Pidgin',
    endonym: 'Naija',
    blurb: 'Nigerian Pidgin. Speech uses the Nigerian English model.',
    system:
      'You be N-ATLaS, multilingual assistant for Nigeria. Answer for Nigerian Pidgin unless the person ask for another language.',
    placeholder: 'Ask N-ATLaS for Pidgin…',
    examples: [
      'Abeg explain how person go cook jollof rice.',
      'Wetin be N-ATLaS and how e fit help developers for Naija?',
      'Write beta welcome message for tech meetup for Lagos.',
    ],
  },
];

export type AsrLanguageOption = {
  id: AsrLanguage;
  label: string;
  model: string;
};

export const ASR_LANGUAGE_OPTIONS: readonly AsrLanguageOption[] = [
  { id: 'ha', label: 'Hausa', model: 'NCAIR1/Hausa-ASR' },
  { id: 'ig', label: 'Igbo', model: 'NCAIR1/Igbo-ASR' },
  { id: 'yo', label: 'Yorùbá', model: 'NCAIR1/Yoruba-ASR' },
  { id: 'en', label: 'Nigerian English', model: 'NCAIR1/NigerianAccentedEnglish' },
];

export function chatLanguageOption(id: ChatLanguage): ChatLanguageOption {
  for (const option of CHAT_LANGUAGE_OPTIONS) {
    if (option.id === id) return option;
  }
  const fallback = CHAT_LANGUAGE_OPTIONS[0];
  if (!fallback) throw new Error('No chat languages are configured.');
  return fallback;
}

export const TRANSLATE_SYSTEM =
  'You translate text into clear English. The source may be Hausa, Igbo, Yorùbá, Nigerian Pidgin, or Nigerian English. Return only the translation, with no preamble.';

export const ATTRIBUTION =
  'N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.';

export const MODEL_CREDIT =
  'Awarri Technologies and the Federal Government of Nigeria, developers of N-ATLaS (Hausa-ASR / Igbo-ASR / Yoruba-ASR / NigerianAccentedEnglish).';

export const WAKING_MESSAGE = 'Waking the model up (first request can take ~2 min).';

export const NOT_CONFIGURED_MESSAGE =
  'No N-ATLAS backend connected. Set NATLAS_BASE_URL and NATLAS_API_KEY on the server, then reload. The key never belongs in the browser.';

export const PRIVACY_NOTE = 'Prompts and audio are not stored.';
