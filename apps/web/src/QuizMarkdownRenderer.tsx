import Markdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// The heavy UGC renderer (ADR-0004), code-split into its own chunk so the
// unified/remark/rehype/micromark graph stays OUT of the initial bundle. It is
// loaded on first markdown render via the lazy() wrapper in QuizMarkdown.tsx;
// markdown-free routes (login / settings / mine / create) never pay for it.
//
// Markdown is rendered via AST to React elements — no HTML string, no
// dangerouslySetInnerHTML, and `skipHtml` drops any raw HTML (we never add
// rehype-raw). rehype-sanitize is defense-in-depth. Images are NOT rendered in
// MVP (shown as their alt text); links open safely.
//
// To add mermaid / KaTeX later, extend `remarkPlugins` / `rehypePlugins` /
// `components` HERE only — stored content is raw markdown, so no data migration.
const components: Components = {
  img: (props) => <span className="md-img-placeholder">{props.alt ?? ""}</span>,
  a: (props) => (
    <a href={props.href} target="_blank" rel="noopener noreferrer nofollow">
      {props.children}
    </a>
  ),
};

export default function QuizMarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
        skipHtml
      >
        {children}
      </Markdown>
    </div>
  );
}
