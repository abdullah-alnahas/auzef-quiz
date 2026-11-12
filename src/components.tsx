import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { dataUrl } from "./data.ts";
import type { Choice, RichText } from "./types.ts";

/** Escape first, then allow only **bold** / *italic* spans. */
function InlineText({ value }: { value: string }) {
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
}: {
  content: RichText;
  className?: string;
  lang: string;
  dir: "rtl" | "ltr";
}) {
  const paragraphs = content.text.split(/\n{2,}/);
  return (
    <div class={className} lang={lang} dir={dir}>
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

/** Turkish/Arabic choice text plus any inline choice images. */
export function ChoiceContent({
  choice,
  showArabic,
}: {
  choice: Choice;
  showArabic: boolean;
}) {
  return (
    <span class="choice-body">
      <span class="choice-tr" lang="tr" dir="ltr">
        {choice.turkish.text}
      </span>
      {showArabic && choice.arabic && (
        <span class="choice-ar" lang="ar" dir="rtl">
          {choice.arabic.text}
        </span>
      )}
      {choice.turkish.images.map((image) => (
        <img
          key={image}
          class="choice-image"
          src={dataUrl(image)}
          alt=""
          loading="lazy"
        />
      ))}
    </span>
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

/** Title + question + cancel/confirm pair, shared by every destructive prompt. */
export function ConfirmDialog({
  titleId,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onClose,
}: {
  titleId: string;
  title: string;
  body: ComponentChildren;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog titleId={titleId} onClose={onClose}>
      <h2 id={titleId}>{title}</h2>
      <p>{body}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost" onClick={onClose}>
          {cancelLabel}
        </button>
        <button type="button" class={tone} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
