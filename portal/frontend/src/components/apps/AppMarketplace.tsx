import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useApps,
  useSubscribeApp,
  useUnsubscribeApp,
  useCatalogs,
} from "@/hooks";
import { useUIStore, useAuthStore } from "@/stores";
import {
  Button,
  Badge,
  EmptyState,
  ConfirmDialog,
  PageHeader,
  ModalOverlay,
  formInputCls,
  formLabelCls,
  formErrCls,
} from "@/components/common/ui";
import { appsApi } from "@/api";
import type { DataApp } from "@/types";

// ── App Card ──────────────────────────────────────────────────────────────────
function AppCard({ app }: { app: DataApp }) {
  const { addToast } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const subscribe = useSubscribeApp();
  const unsubscribe = useUnsubscribeApp();
  const [confirmSub, setConfirmSub] = useState(false);
  const [confirmUnsub, setConfirmUnsub] = useState(false);

  const isOwner = app.owner_user_id === user?.user_id;

  const handleRedirect = async () => {
    try {
      const { redirect_url } = await appsApi.redirectToken(app.app_id);
      window.location.href = redirect_url;
    } catch {
      addToast({ type: "error", message: "リダイレクトに失敗しました" });
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
        app.is_subscribed
          ? "border-teal-200"
          : "border-gray-100 hover:border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900">{app.name}</h3>
        <div className="flex gap-1.5 flex-shrink-0">
          {isOwner && <Badge variant="purple">オーナー</Badge>}
          <Badge variant={app.is_subscribed ? "green" : "gray"}>
            {app.is_subscribed ? "利用中" : "未登録"}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed flex-1 line-clamp-3">
        {app.description || "説明なし"}
      </p>

      {app.used_catalogs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {app.used_catalogs.map((c) => (
            <span
              key={c}
              className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-50 gap-2">
        <span className="text-xs text-gray-400 truncate">
          {app.owner_user_id}
        </span>
        <div className="flex gap-1.5">
          {app.is_subscribed ? (
            <>
              <Button size="sm" variant="primary" onClick={handleRedirect}>
                アプリへ移動
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setConfirmUnsub(true)}
              >
                解除
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirmSub(true)}
            >
              使用開始
            </Button>
          )}
        </div>
      </div>

      {confirmSub && (
        <ConfirmDialog
          title={`${app.name} の使用を開始しますか？`}
          message="アプリのデータカタログへのアクセスが設定されます。"
          onCancel={() => setConfirmSub(false)}
          loading={subscribe.isPending}
          onConfirm={() =>
            subscribe.mutate(app.app_id, {
              onSuccess: () => {
                setConfirmSub(false);
                addToast({ type: "success", message: "使用開始しました" });
              },
              onError: () =>
                addToast({ type: "error", message: "使用開始に失敗しました" }),
            })
          }
        />
      )}
      {confirmUnsub && (
        <ConfirmDialog
          title={`${app.name} の使用を解除しますか？`}
          message="アプリへのアクセスが無効になります。"
          onCancel={() => setConfirmUnsub(false)}
          loading={unsubscribe.isPending}
          onConfirm={() =>
            unsubscribe.mutate(app.app_id, {
              onSuccess: () => {
                setConfirmUnsub(false);
                addToast({ type: "success", message: "解除しました" });
              },
              onError: () =>
                addToast({ type: "error", message: "解除に失敗しました" }),
            })
          }
        />
      )}
    </div>
  );
}

// ── Marketplace ───────────────────────────────────────────────────────────────
export function AppMarketplace() {
  const [subscribed, setSubscribed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = useApps({ subscribed: subscribed || undefined });

  return (
    <div className="p-6">
      <PageHeader
        title="データアプリ"
        description="データアプリのマーケットプレイス"
        action={
          <Button variant="primary" onClick={() => setShowForm(true)}>
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            登録申請
          </Button>
        }
      />

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setSubscribed(!subscribed)}
          className={`px-3 h-8 text-xs rounded-md border transition-colors ${
            subscribed
              ? "bg-teal-600 text-white border-teal-700"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          利用中のみ
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 p-4 h-40 animate-pulse"
            />
          ))}
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState
          title="アプリがありません"
          description="「登録申請」から新しいアプリを登録できます"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data?.items ?? []).map((app) => (
            <AppCard key={app.app_id} app={app} />
          ))}
        </div>
      )}

      {showForm && (
        <ModalOverlay maxWidth="md" onClose={() => setShowForm(false)}>
          <div className="flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-medium text-gray-900">
                データアプリ登録申請
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto">
              <AppRegistrationForm onSuccess={() => setShowForm(false)} />
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Registration form ─────────────────────────────────────────────────────────
const schema = z.object({
  name: z.string().min(1, "必須"),
  description: z.string().min(1, "必須"),
  redirect_url: z.string().url("有効な URL を入力してください"),
  used_catalog_names: z.array(z.string()).min(1, "1つ以上選択してください"),
  published_catalog_names: z.array(z.string()).optional(),
  use_cognito: z.boolean(),
  cognito_user_pool_arn: z.string().optional(),
  cognito_region: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function AppRegistrationForm({ onSuccess }: { onSuccess: () => void }) {
  const { addToast } = useUIStore();
  const { data: catalogs } = useCatalogs();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      use_cognito: false,
      used_catalog_names: [],
      published_catalog_names: [],
    },
  });
  const useCognito = watch("use_cognito");

  const onSubmit = async (values: FormValues) => {
    try {
      await appsApi.create({
        name: values.name,
        description: values.description,
        redirect_url: values.redirect_url,
        used_catalog_names: values.used_catalog_names,
        published_catalog_names: values.published_catalog_names,
        ...(values.use_cognito && {
          cognito_user_pool_arn: values.cognito_user_pool_arn,
          cognito_region: values.cognito_region,
        }),
      });
      addToast({ type: "success", message: "アプリを登録しました" });
      onSuccess();
    } catch {
      addToast({ type: "error", message: "登録に失敗しました" });
    }
  };

  const inputCls = formInputCls;
  const errCls = formErrCls;
  const labelCls = formLabelCls;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
      <div>
        <label className={labelCls}>
          アプリ名 <span className="text-red-500">*</span>
        </label>
        <input {...register("name")} className={inputCls} />
        {errors.name && <p className={errCls}>{errors.name.message}</p>}
      </div>

      <div>
        <label className={labelCls}>
          説明 <span className="text-red-500">*</span>
        </label>
        <textarea
          {...register("description")}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white text-gray-900 outline-none focus:border-teal-400 resize-none"
        />
        {errors.description && (
          <p className={errCls}>{errors.description.message}</p>
        )}
      </div>

      <div>
        <label className={labelCls}>
          遷移先 URL <span className="text-red-500">*</span>
        </label>
        <input
          {...register("redirect_url")}
          className={inputCls}
          placeholder="https://app.example.com"
        />
        {errors.redirect_url && (
          <p className={errCls}>{errors.redirect_url.message}</p>
        )}
      </div>

      <div>
        <label className={labelCls}>
          使用カタログ <span className="text-red-500">*</span>
        </label>
        <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-200 rounded-md p-2 bg-white">
          {(catalogs?.items ?? []).map((c) => (
            <label
              key={c.catalog_name}
              className="flex items-center gap-2 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                value={c.catalog_name}
                {...register("used_catalog_names")}
                className="rounded border-gray-300 text-teal-600"
              />
              <span className="font-mono">{c.catalog_name}</span>
            </label>
          ))}
        </div>
        {errors.used_catalog_names && (
          <p className={errCls}>{errors.used_catalog_names.message}</p>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            {...register("use_cognito")}
            className="rounded border-gray-300 text-teal-600"
          />
          Cognito 連携を使用する（自動ユーザー登録）
        </label>
      </div>

      {useCognito && (
        <div className="space-y-3 pl-4 border-l-2 border-teal-200">
          <div>
            <label className={labelCls}>Cognito User Pool ARN</label>
            <input
              {...register("cognito_user_pool_arn")}
              className={inputCls}
              placeholder="arn:aws:cognito-idp:ap-northeast-1:123456789:userpool/..."
            />
          </div>
          <div>
            <label className={labelCls}>リージョン</label>
            <input
              {...register("cognito_region")}
              className={inputCls}
              placeholder="ap-northeast-1"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onSuccess}>
          キャンセル
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          登録する
        </Button>
      </div>
    </form>
  );
}
