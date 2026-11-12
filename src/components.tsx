import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { dataUrl } from "./data.ts";
import type { RichText } from "./types.ts";

/** Escape first, then allow only **bold** / *italic* spans. */
export function InlineText({ value }: { value: string }) {
  const parts: ComponentChildren[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > last) parts.push(value.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < value.length) parts.push(value.slice(last));
  return <>{parts}</>;
}

export function RichTextView({
  content,
  className,
  lang,
  dir,
  id,
}: {
  content: RichText;
  className?: string;
  lang: string;
  dir: "rtl" | "ltr";
  id?: string;
}) {
  const paragraphs = content.text.split(/\n{2,}/);
  return (
    <div class={className} id={id} lang={lang} dir={dir}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split("\n").map((line, lineIndex) => (
            <>
              {lineIndex > 0 && <br />}
              <InlineText value={line} />
            </>
          ))}
        </p>
      ))}
      {content.images.map((image) => (
        <img
          key={image}
          src={dataUrl(image)}
          alt=""
          loading="lazy"
          class="question-image"
        />
      ))}
    </div>
  );
}

/**
 * A localized sentence that embeds one dynamic data value. The template marks
 * the slot with a NUL placeholder — `t(lang, "fromExam", { name: "\u0000" })` —
 * so the value stays its own bidi-isolated, language-tagged run instead of
 * being reordered by the surrounding RTL paragraph.
 */
export function DataValue({
  template,
  value,
  lang,
}: {
  template: string;
  value: string;
  lang: string;
}) {
  const [before, after = ""] = template.split("\u0000");
  return (
    <>
      {before}
      <bdi lang={lang}>{value}</bdi>
      {after}
    </>
  );
}

export function TableView({ rows }: { rows: string[][] }) {
  if (!rows.length) return null;
  const [head, ...body] = rows;
  return (
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ComponentChildren;
  tone?: "neutral" | "warn" | "ok" | "bad";
}) {
  return <span class={`badge badge-${tone}`}>{children}</span>;
}

/** Native modal dialog: focus trap, Escape handling and aria wiring for free. */
export function Dialog({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
