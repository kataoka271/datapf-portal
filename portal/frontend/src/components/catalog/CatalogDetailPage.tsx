import { Link } from "@tanstack/react-router";
import { useCatalog } from "@/hooks";
import { useAuthStore } from "@/stores";
import { Badge, Button, Spinner, EmptyState } from "@/components/common/ui";
import { MouAgreementModal } from "./MouAgreementModal";
import { useState } from "react";
import type { Catalog } from "@/types";

function SchemaTable({
  schemas,
}: {
  schemas: { schema_name: string; table_count: number }[];
}) {
  if (schemas.length === 0)
    return (
      <EmptyState
        title="スキーマがありません"
        description="このカタログにはまだスキーマが登録されていません"
      />
    );
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              スキーマ
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              テーブル数
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {schemas.map((s) => (
            <tr
              key={s.schema_name}
              className="hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                {s.schema_name}
              </td>
              <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                {s.table_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccessStatusBanner({ catalog }: { catalog: Catalog }) {
  const [applyTarget, setApplyTarget] = useState<Catalog | null>(null);

  const isOwner = catalog.my_role === "owner" || catalog.my_role === "editor";
  const isApproved = catalog.my_request_status === "APPROVED";
  const isPending = catalog.my_request_status === "PENDING";

  if (isOwner) return null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-gray-700 mb-0.5">
            あなたのアクセス状況
          </p>
          {isApproved ? (
            <p className="text-xs text-gray-500">閲覧権限が付与されています</p>
          ) : isPending ? (
            <p className="text-xs text-gray-500">
              申請中です。データオーナーの承認をお待ちください。
            </p>
          ) : catalog.my_request_status === "REJECTED" ? (
            <p className="text-xs text-gray-500">
              申請が却下されました。再度申請することができます。
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              このカタログへの閲覧権限がありません。
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          {isApproved ? (
            <Badge variant="green">閲覧中</Badge>
          ) : isPending ? (
            <Badge variant="amber">審査中</Badge>
          ) : catalog.my_request_status === "REJECTED" ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setApplyTarget(catalog)}
            >
              再申請
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setApplyTarget(catalog)}
            >
              閲覧申請
            </Button>
          )}
        </div>
      </div>

      {applyTarget && (
        <MouAgreementModal
          catalogName={applyTarget.catalog_name}
          onClose={() => setApplyTarget(null)}
          onSuccess={() => setApplyTarget(null)}
        />
      )}
    </>
  );
}

export function CatalogDetailPage({ catalogName }: { catalogName: string }) {
  const { data, isLoading } = useCatalog(catalogName);
  const user = useAuthStore((s) => s.user);

  const isOwner =
    data?.my_role === "owner" ||
    user?.catalog_roles.some(
      (r) => r.catalog_name === catalogName && r.role === "owner",
    );

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );

  if (!data)
    return (
      <div className="p-6">
        <EmptyState
          title="カタログが見つかりません"
          description={`"${catalogName}" は存在しないか、アクセスできません`}
        />
      </div>
    );

  return (
    <div className="p-6 space-y-5">
      {/* Back link */}
      <Link
        to="/catalogs/marketplace"
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
        マーケットプレイスへ戻る
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">
              {data.display_name}
            </h1>
            <p className="text-xs font-mono text-gray-400 mt-0.5">
              {data.catalog_name}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              MOU {data.mou_version}
            </span>
            <Badge variant={data.status === "ACTIVE" ? "green" : "gray"}>
              {data.status === "ACTIVE" ? "有効" : "停止中"}
            </Badge>
            {data.requires_approval && (
              <Badge variant="amber">承認フローあり</Badge>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">
          {data.description || "説明なし"}
        </p>

        <p className="text-xs text-gray-400 mt-3">
          オーナー: {data.owner_user_id}
        </p>
      </div>

      {/* Owner actions */}
      {isOwner && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            オーナー管理
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/catalogs/${catalogName}/mou`}>
              <Button variant="primary">
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                MOU 編集
              </Button>
            </Link>
            <Link to={`/catalogs/${catalogName}/requests`}>
              <Button variant="secondary">
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
                    d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                申請管理
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Access status for non-owners */}
      <AccessStatusBanner catalog={data} />

      {/* Schema list */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          スキーマ一覧
        </p>
        <SchemaTable schemas={data.schemas} />
      </div>
    </div>
  );
}
