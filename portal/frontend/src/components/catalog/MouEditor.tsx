import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMou, useUpdateMou } from "@/hooks";
import { useUIStore } from "@/stores";
import { Button, Spinner, PageHeader, ModalOverlay } from "@/components/common/ui";

export function MouEditor({ catalogName }: { catalogName: string }) {
  const { data: mou, isLoading } = useMou(catalogName);
  const updateMou = useUpdateMou();
  const { addToast } = useUIStore();

  const [mouText, setMouText] = useState("");
  const [checklist, setChecklist] = useState<
    { label: string; required: boolean }[]
  >([]);
  const [preview, setPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mou) {
      setMouText(mou.mou_text);
      setChecklist(
        mou.checklist.map((i) => ({ label: i.label, required: i.required })),
      );
    }
  }, [mou]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addItem = () =>
    setChecklist((p) => [...p, { label: "", required: false }]);
  const removeItem = (i: number) =>
    setChecklist((p) => p.filter((_, j) => j !== i));
  const updateItem = (
    i: number,
    field: "label" | "required",
    value: string | boolean,
  ) =>
    setChecklist((p) =>
      p.map((item, j) => (j === i ? { ...item, [field]: value } : item)),
    );

  const handleSave = () => {
    updateMou.mutate(
      { catalogName, body: { mou_text: mouText, checklist } },
      {
        onSuccess: (res) => {
          addToast({
            type: "success",
            message: `MOU ${res.version} を発行しました`,
          });
          setConfirmOpen(false);
        },
        onError: () =>
          addToast({ type: "error", message: "更新に失敗しました" }),
      },
    );
  };

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );

  return (
    <div className="p-6 space-y-5">
      <Link
        to={`/catalogs/${catalogName}`}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-600 transition-colors"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        カタログ詳細へ戻る
      </Link>

      <PageHeader
        title="MOU・チェックリスト編集"
        description={`${catalogName} — 現在のバージョン: ${mou?.version ?? "-"}`}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setPreview(!preview)}
              className={`px-3 h-8 text-xs rounded-md border transition-colors ${
                preview
                  ? "bg-gray-700 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {preview ? "エディタ" : "プレビュー"}
            </button>
            <Button variant="primary" onClick={() => setConfirmOpen(true)}>
              バージョンを発行
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-5">
        {/* MOU text editor */}
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">
            MOU 本文（Markdown）
          </p>
          {preview ? (
            <div className="bg-white rounded-xl border border-gray-100 p-4 min-h-64 prose prose-sm max-w-none text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {mouText}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              value={mouText}
              onChange={(e) => setMouText(e.target.value)}
              rows={16}
              className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-xl bg-white text-gray-900 outline-none focus:border-teal-400 resize-none"
              placeholder="# MOU 本文&#10;&#10;Markdown で記述してください..."
            />
          )}
        </div>

        {/* Checklist editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-700">チェックリスト</p>
            <Button size="sm" variant="secondary" onClick={addItem}>
              + 追加
            </Button>
          </div>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 p-2.5"
              >
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateItem(i, "label", e.target.value)}
                  placeholder="チェック項目のテキスト"
                  className="flex-1 text-xs border-none bg-transparent outline-none text-gray-900 placeholder-gray-400"
                />
                <label className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(e) =>
                      updateItem(i, "required", e.target.checked)
                    }
                    className="rounded border-gray-300 text-teal-600"
                  />
                  必須
                </label>
                <button
                  onClick={() => removeItem(i)}
                  className="text-gray-300 hover:text-red-400 flex-shrink-0"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
            {checklist.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                「追加」ボタンでチェック項目を追加してください
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && (
        <ModalOverlay maxWidth="sm" onClose={() => setConfirmOpen(false)}>
          <div className="p-5">
            <h3 className="text-base font-medium text-gray-900 mb-2">
              バージョンを発行しますか？
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              新しいバージョンが発行されます。
            </p>
            <p className="text-xs text-gray-400 mb-5">
              既存の承認済みユーザーへの影響はありません。
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={updateMou.isPending}
              >
                発行する
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
