import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppMou, useSubscribeApp } from "@/hooks";
import { useUIStore } from "@/stores";
import { Button, Spinner, ModalOverlay } from "@/components/common/ui";

interface Props {
  appId: string;
  appName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AppMouAgreementModal({
  appId,
  appName,
  onClose,
  onSuccess,
}: Props) {
  const { data: mou, isLoading } = useAppMou(appId);
  const { addToast } = useUIStore();
  const subscribe = useSubscribeApp();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  if (!mou && !isLoading) return null;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const requiredUnchecked =
    mou?.checklist.filter((i) => i.required && !checked.has(i.item_id)) ?? [];
  const canSubmit = requiredUnchecked.length === 0;

  const handleSubmit = () => {
    if (!mou) return;
    subscribe.mutate(
      {
        appId,
        mouVersion: mou.version,
        checklistResponses: mou.checklist.map((i) => ({
          item_id: i.item_id,
          checked: checked.has(i.item_id),
        })),
      },
      {
        onSuccess: () => {
          addToast({ type: "success", message: "使用開始しました" });
          onSuccess();
        },
        onError: () =>
          addToast({ type: "error", message: "使用開始に失敗しました" }),
      },
    );
  };

  return (
    <ModalOverlay maxWidth="md">
      <div className="flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-gray-900">
              利用規約への同意
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{appName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-700">MOU 本文</p>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    {mou!.version}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto text-xs text-gray-700 leading-relaxed prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {mou!.mou_text}
                  </ReactMarkdown>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">
                  チェックリスト
                </p>
                <div className="space-y-2">
                  {mou!.checklist.map((item) => (
                    <label
                      key={item.item_id}
                      className="flex items-start gap-2.5 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(item.item_id)}
                        onChange={() => toggle(item.item_id)}
                        className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-xs text-gray-700 flex-1 leading-relaxed">
                        {item.label}
                      </span>
                      {item.required && (
                        <span className="text-xs text-red-500 flex-shrink-0">
                          必須
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit || isLoading}
            loading={subscribe.isPending}
            onClick={handleSubmit}
          >
            合意して使用開始
          </Button>
        </div>
      </div>
    </ModalOverlay>
  );
}
