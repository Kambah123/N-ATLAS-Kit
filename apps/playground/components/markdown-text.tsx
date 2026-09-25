import { type ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function inlineNodes(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (
        (part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))
      ) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (
        (part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_'))
      ) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) return <span key={key}>{link[1]}</span>;
      return <span key={key}>{part}</span>;
    });
}

function isList(line: string, ordered: boolean): RegExpExecArray | null {
  return (ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/).exec(line);
}

/** Render the markup N-ATLaS emits. The text is never inserted as HTML. */
export function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const ordered = Boolean(isList(line, true));
    const bullet = Boolean(isList(line, false));
    if (ordered || bullet) {
      const items: string[] = [];
      const start = index;
      while (index < lines.length) {
        const match = isList(lines[index] ?? '', ordered);
        if (!match) break;
        items.push(match[1] ?? '');
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={start} className={`my-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((item, itemIndex) => (
            <li key={`${start}-${itemIndex}`}>{inlineNodes(item, `${start}-${itemIndex}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={index} className="font-semibold">
          {inlineNodes(heading[2] ?? '', String(index))}
        </p>,
      );
      index += 1;
      continue;
    }
    const paragraph: string[] = [];
    const start = index;
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (
        !current.trim() ||
        isList(current, true) ||
        isList(current, false) ||
        /^#{1,3}\s+/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push(<p key={start}>{inlineNodes(paragraph.join(' '), String(start))}</p>);
  }
  return <div className="space-y-2">{blocks}</div>;
}
