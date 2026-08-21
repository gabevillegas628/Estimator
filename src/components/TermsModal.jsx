import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

// TERMS.md is imported raw rather than retyped as JSX so there is exactly one
// copy of the terms. Editing the file at the repo root changes what this modal
// shows; the two can never drift apart.
import termsMarkdown from "../../TERMS.md?raw";

// A deliberately small markdown subset — headings, paragraphs, bullets, rules,
// bold/italic. Enough for TERMS.md and nothing more, which is why there is no
// markdown dependency here. Links render as their label text: the documents
// TERMS.md points at (LICENSE, THIRD-PARTY-NOTICES.md) live in the repo and
// are not served, so a real href would only ever 404.
function renderInline(text, keyPrefix) {
  // Declared inside the function on purpose: a module-level /g regex would
  // carry lastIndex between calls and silently drop matches.
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\([^)]+\)|`([^`]+)`/g;
  const out = [];
  let last = 0;
  let match;
  let i = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-i${i++}`;

    if (match[1] !== undefined) {
      out.push(<strong key={key} className="font-semibold text-[#232530]">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      out.push(<em key={key}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      out.push(match[3]);
    } else {
      out.push(<code key={key} className="mono text-[0.9em]">{match[4]}</code>);
    }
    last = re.lastIndex;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parseBlocks(markdown) {
  const blocks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "ul", items: list });
      list = [];
    }
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();

    if (/^-{3,}$/.test(line)) {
      flushParagraph(); flushList();
      blocks.push({ type: "hr" });
    } else if (/^#{1,6}\s/.test(line)) {
      flushParagraph(); flushList();
      blocks.push({ type: "h", level: line.match(/^#+/)[0].length, text: line.replace(/^#+\s*/, "") });
    } else if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ""));
    } else if (line === "") {
      flushParagraph(); flushList();
    } else if (list.length && /^\s{2,}\S/.test(raw)) {
      // Wrapped continuation of the bullet above it.
      list[list.length - 1] += ` ${line}`;
    } else {
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}

// Parsed once at module load: the terms are a build-time constant.
const BLOCKS = parseBlocks(termsMarkdown);

export default function TermsModal({ onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  // .screen-only so the terms never land on a printed estimate, matching
  // PrintDialog and ShowWorkModal.
  return (
    <div
      className="screen-only fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#232530]/40 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        tabIndex={-1}
        className="fade-in bg-[#F0EEE8] w-full max-w-2xl max-h-full flex flex-col rounded-lg border border-[#DDD8CA] shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#DDD8CA] bg-white rounded-t-lg shrink-0">
          <div>
            <h2 id="terms-title" className="serif text-xl text-[#232530]">
              Terms of Service
            </h2>
            <p className="text-xs text-[#6B6656] mt-0.5">
              Wildtype Technologies LLC · estimates require human verification
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-[#9A9584] hover:text-[#232530] hover:bg-[#E7E3D8] transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto grow">
          <div className="bg-white rounded-lg border border-[#DDD8CA] p-5">
            {BLOCKS.map((block, i) => {
              // The file's own H1 duplicates the modal header above.
              if (block.type === "h" && block.level === 1) return null;

              if (block.type === "hr") {
                return <hr key={i} className="my-4 border-t border-[#DDD8CA]" />;
              }
              if (block.type === "h") {
                return (
                  <h3 key={i} className="serif text-base text-[#232530] mt-5 first:mt-0 mb-1.5">
                    {renderInline(block.text, `h${i}`)}
                  </h3>
                );
              }
              if (block.type === "ul") {
                return (
                  <ul key={i} className="list-disc pl-5 space-y-1.5 my-2">
                    {block.items.map((item, j) => (
                      <li key={j} className="text-xs text-[#6B6656] leading-relaxed">
                        {renderInline(item, `l${i}-${j}`)}
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={i} className="text-xs text-[#6B6656] leading-relaxed my-2">
                  {renderInline(block.text, `p${i}`)}
                </p>
              );
            })}
          </div>
        </div>

        <div className="border-t border-[#DDD8CA] bg-white rounded-b-lg px-5 py-3 flex items-center shrink-0">
          <p className="text-xs text-[#9A9584]">Estimate only — not an official award notice.</p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md border border-[#C9C4B8] text-sm px-3 py-2 text-[#6B6656] hover:bg-[#E7E3D8] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
