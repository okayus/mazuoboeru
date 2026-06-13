import { lazy, Suspense } from "react";

// Public entry point for UGC markdown (ADR-0004). The heavy renderer
// (react-markdown + remark/rehype) is code-split into a separate chunk and loaded
// on first use, so markdown-free routes don't pay for it and the app shell paints
// before it arrives. Call sites stay unchanged: <QuizMarkdown>{content}</QuizMarkdown>.
//
// One module-level lazy() = one shared chunk reused across every instance (the
// first render to mount triggers the import; the rest reuse it).
const QuizMarkdownRenderer = lazy(() => import("./QuizMarkdownRenderer"));

export function QuizMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="md" />}>
      <QuizMarkdownRenderer>{children}</QuizMarkdownRenderer>
    </Suspense>
  );
}
