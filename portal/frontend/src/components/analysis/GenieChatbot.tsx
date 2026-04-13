import { useEffect, useRef, useState } from "react";
import { useCatalogs } from "@/hooks";
import { useGenieChat } from "@/hooks";
import { useUIStore } from "@/stores";
import { Button, EmptyState, PageHeader, Spinner } from "@/components/common/ui";
import type { GenieMessage, GenieQueryResult } from "@/types";

function QueryResultTable({ result }: { result: GenieQueryResult }) {
  if (result.columns.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
      <table className="text-xs min-w-full">
        <thead className="bg-gray-50">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {result.rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2 text-gray-700 whitespace-nowrap"
                >
                  {cell === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChatBubble({ msg }: { msg: GenieMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? "bg-teal-600 text-white rounded-br-sm"
            : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm"
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        {!isUser && msg.query_result && (
          <QueryResultTable result={msg.query_result} />
        )}
      </div>
    </div>
  );
}

export function GenieChatbot() {
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<GenieMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const { addToast } = useUIStore();
  const { data: catalogsData } = useCatalogs({ subscribed: true });
  const genie = useGenieChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  const catalogs = catalogsData?.items ?? [];

  // カタログが変わったら会話をリセット
  const handleCatalogChange = (name: string) => {
    setSelectedCatalog(name);
    setMessages([]);
    setConversationId(null);
  };

  // メッセージ追加後に一番下までスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !selectedCatalog) return;

    const userMsg: GenieMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    genie.mutate(
      { conversationId, catalogName: selectedCatalog, message: text },
      {
        onSuccess: (data) => {
          if (data.conversation_id && !conversationId) {
            setConversationId(data.conversation_id);
          }
          const assistantMsg: GenieMessage = {
            role: "assistant",
            content: data.reply || "（返答がありませんでした）",
            query_result: data.query_result,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        },
        onError: () => {
          addToast({ type: "error", message: "Genie への問い合わせに失敗しました" });
          // ユーザーメッセージを取り消す
          setMessages((prev) => prev.slice(0, -1));
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-6 flex flex-col h-full gap-4">
      {/* Header + catalog selector */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Genie チャット"
          description="自然言語でカタログのデータに質問できます"
        />
        <div className="flex-shrink-0">
          <select
            value={selectedCatalog}
            onChange={(e) => handleCatalogChange(e.target.value)}
            className="h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-48"
          >
            <option value="">カタログを選択...</option>
            {catalogs.map((c) => (
              <option key={c.catalog_name} value={c.catalog_name}>
                {c.display_name || c.catalog_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!selectedCatalog && (
            <EmptyState
              title="カタログを選択してください"
              description="上のセレクタから対象カタログを選んでから質問を入力してください"
            />
          )}

          {selectedCatalog && messages.length === 0 && !genie.isPending && (
            <EmptyState
              title="質問を入力してください"
              description={`「${catalogs.find((c) => c.catalog_name === selectedCatalog)?.display_name ?? selectedCatalog}」について自由に質問できます`}
            />
          )}

          {messages.map((msg, i) => (
            <ChatBubble key={i} msg={msg} />
          ))}

          {genie.isPending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <Spinner />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-100 p-3 flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedCatalog
                ? "質問を入力... (Enter で送信、Shift+Enter で改行)"
                : "先にカタログを選択してください"
            }
            disabled={!selectedCatalog || genie.isPending}
            rows={2}
            className="flex-1 resize-none px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          />
          <Button
            variant="primary"
            loading={genie.isPending}
            onClick={handleSend}
            disabled={!input.trim() || !selectedCatalog}
          >
            送信
          </Button>
        </div>
      </div>
    </div>
  );
}
