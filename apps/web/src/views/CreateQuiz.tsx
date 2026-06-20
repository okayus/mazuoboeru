import { useState } from "react";
import { api, isApiError, type QuestionInput, type QuestionType, type QuizInput } from "../api";
import { navigate } from "../useRoute";

type ChoiceDraft = { id: string; text: string; isCorrect: boolean };
type QuestionDraft = {
  id: string;
  type: QuestionType;
  prompt: string;
  explanation: string;
  choices: ChoiceDraft[];
};

// Stable client-side ids for React keys. Without these, removing a middle question
// / choice (index keys) misassociates DOM state — focus, IME composition, radio
// grouping — to the wrong row. Ids never leave the client (buildInput strips them).
const emptyChoice = (): ChoiceDraft => ({ id: crypto.randomUUID(), text: "", isCorrect: false });
const emptyQuestion = (): QuestionDraft => ({
  id: crypto.randomUUID(),
  type: "mcq_single",
  prompt: "",
  explanation: "",
  choices: [emptyChoice(), emptyChoice()],
});

export function CreateQuiz() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  const patchQuestion = (qi: number, fn: (q: QuestionDraft) => QuestionDraft) =>
    setQuestions((qs) => qs.map((q, i) => (i === qi ? fn(q) : q)));

  const setType = (qi: number, type: QuestionType) =>
    patchQuestion(qi, (q) => {
      if (type === "mcq_single") {
        // keep at most one correct when narrowing to single-answer
        let kept = false;
        const choices = q.choices.map((c) => {
          if (c.isCorrect && !kept) {
            kept = true;
            return c;
          }
          return { ...c, isCorrect: false };
        });
        return { ...q, type, choices };
      }
      return { ...q, type };
    });

  const setCorrect = (qi: number, ci: number, value: boolean) =>
    patchQuestion(qi, (q) =>
      q.type === "mcq_single"
        ? { ...q, choices: q.choices.map((c, j) => ({ ...c, isCorrect: j === ci })) }
        : { ...q, choices: q.choices.map((c, j) => (j === ci ? { ...c, isCorrect: value } : c)) },
    );

  const buildInput = (): QuizInput => {
    const input: QuizInput = {
      title: title.trim(),
      questions: questions.map((q) => {
        const out: QuestionInput = {
          type: q.type,
          prompt: q.prompt.trim(),
          choices: q.choices.map((c) => ({ text: c.text.trim(), isCorrect: c.isCorrect })),
        };
        if (q.explanation.trim()) out.explanation = q.explanation.trim();
        return out;
      }),
    };
    if (description.trim()) input.description = description.trim();
    const tagList = tags
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tagList.length) input.tags = tagList;
    return input;
  };

  const save = async (publish: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createQuiz(buildInput());
      if (publish) {
        try {
          await api.publishQuiz(id);
        } catch (e) {
          if (isApiError(e) && e.status === 422) {
            setError(
              "公開条件を満たしていません（タイトル / 設問1つ以上 / 各設問の選択肢2つ以上 / 単一選択は正解1つ・複数選択は正解1つ以上）。下書きとして保存しました。",
            );
            navigate("/mine");
            return;
          }
          throw e;
        }
      }
      navigate("/mine");
    } catch (e) {
      if (isApiError(e) && e.status === 401) setNeedLogin(true);
      else setError("保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (needLogin)
    return (
      <p>
        作成には <a href="#/login">ログイン</a> が必要です。
      </p>
    );

  return (
    <div>
      <h2>クイズを作る</h2>
      <p className="meta">
        公開すると全ユーザーに見えます。公開は取り消せません（下書きには戻せません）。
      </p>

      <label className="field">
        <span>タイトル</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 日本の地理"
        />
      </label>
      <label className="field">
        <span>説明（Markdown 可）</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      <label className="field">
        <span>タグ（カンマ/スペース区切り・最大5・任意）</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="例: Docker, ネットワーク"
        />
      </label>

      {questions.map((q, qi) => (
        <div key={q.id} className="card question-edit">
          <div className="q-head">
            <strong>Q{qi + 1}</strong>
            <select value={q.type} onChange={(e) => setType(qi, e.target.value as QuestionType)}>
              <option value="mcq_single">単一選択</option>
              <option value="mcq_multi">複数選択</option>
            </select>
            {questions.length > 1 ? (
              <button
                className="link"
                onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}
              >
                設問を削除
              </button>
            ) : null}
          </div>

          <label className="field">
            <span>設問文（Markdown 可）</span>
            <textarea
              value={q.prompt}
              onChange={(e) => patchQuestion(qi, (qq) => ({ ...qq, prompt: e.target.value }))}
              rows={2}
            />
          </label>

          <div className="field">
            <span>選択肢（チェックで正解）</span>
            {q.choices.map((c, ci) => (
              <div key={c.id} className="choice-edit">
                <input
                  type={q.type === "mcq_single" ? "radio" : "checkbox"}
                  name={`correct-${q.id}`}
                  checked={c.isCorrect}
                  onChange={(e) => setCorrect(qi, ci, e.target.checked)}
                />
                <input
                  value={c.text}
                  placeholder={`選択肢 ${ci + 1}`}
                  onChange={(e) =>
                    patchQuestion(qi, (qq) => ({
                      ...qq,
                      choices: qq.choices.map((cc, j) =>
                        j === ci ? { ...cc, text: e.target.value } : cc,
                      ),
                    }))
                  }
                />
                {q.choices.length > 2 ? (
                  <button
                    className="link"
                    onClick={() =>
                      patchQuestion(qi, (qq) => ({
                        ...qq,
                        choices: qq.choices.filter((_, j) => j !== ci),
                      }))
                    }
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            <button
              className="link"
              onClick={() =>
                patchQuestion(qi, (qq) => ({ ...qq, choices: [...qq.choices, emptyChoice()] }))
              }
            >
              ＋ 選択肢を追加
            </button>
          </div>

          <label className="field">
            <span>解説（任意・採点後に表示）</span>
            <textarea
              value={q.explanation}
              onChange={(e) => patchQuestion(qi, (qq) => ({ ...qq, explanation: e.target.value }))}
              rows={2}
            />
          </label>
        </div>
      ))}

      <p>
        <button className="link" onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}>
          ＋ 設問を追加
        </button>
      </p>

      {error ? <p className="error">{error}</p> : null}

      <div className="btn-row">
        <button onClick={() => save(false)} disabled={busy}>
          下書き保存
        </button>
        <button onClick={() => save(true)} disabled={busy}>
          保存して公開
        </button>
      </div>
    </div>
  );
}
