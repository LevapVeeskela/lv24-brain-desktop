import type { ReactNode } from "react";

interface Block {
  type: "heading" | "paragraph" | "code" | "list";
  lines: string[];
}

/**
 * Deliberately small Markdown subset: headings, fenced code, unordered lists
 * and paragraphs. Everything renders as text nodes, so record bodies can
 * never inject HTML.
 */
export function RecordBody({ body }: { body: string }) {
  const blocks = splitBlocks(body);
  if (blocks.length === 0) {
    return <p className="muted">{body}</p>;
  }
  return (
    <div className="record-body">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: Block, index: number): ReactNode {
  const text = block.lines.join("\n");
  switch (block.type) {
    case "heading": {
      const match = /^(#{1,4})\s+(.*)$/.exec(block.lines[0] ?? "");
      const level = match?.[1].length ?? 2;
      const content = match?.[2] ?? text;
      if (level <= 2) {
        return <h3 key={index}>{content}</h3>;
      }
      return <h4 key={index}>{content}</h4>;
    }
    case "code":
      return (
        <pre className="record-code" key={index}>
          <code>{text}</code>
        </pre>
      );
    case "list":
      return (
        <ul key={index}>
          {block.lines.map((line, itemIndex) => (
            <li key={itemIndex}>{line.replace(/^\s*[-*]\s+/, "")}</li>
          ))}
        </ul>
      );
    default:
      return <p key={index}>{text}</p>;
  }
}

function splitBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let current: Block | null = null;
  let inCode = false;

  const flush = (): void => {
    if (current && current.lines.length > 0) {
      blocks.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        flush();
        inCode = false;
      } else {
        flush();
        current = { type: "code", lines: [] };
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      current?.lines.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) {
      flush();
      blocks.push({ type: "heading", lines: [line] });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (current?.type !== "list") {
        flush();
        current = { type: "list", lines: [] };
      }
      current.lines.push(line);
      continue;
    }
    if (current?.type !== "paragraph") {
      flush();
      current = { type: "paragraph", lines: [] };
    }
    current.lines.push(line);
  }
  flush();
  return blocks;
}
