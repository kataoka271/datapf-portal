import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateCatalog } from "@/hooks";
import { useUIStore } from "@/stores";
import { Button, ModalOverlay } from "@/components/common/ui";

const schema = z.object({
  catalog_name: z
    .string()
    .min(1, "必須です")
    .regex(/^[a-zA-Z0-9_]+$/, "英数字とアンダースコアのみ使用できます"),
  display_name: z.string().min(1, "必須です"),
  description: z.string(),
  requires_approval: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export function CatalogCreateModal({ onClose, onSuccess }: Props) {
  const { addToast } = useUIStore();
  const create = useCreateCatalog();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      catalog_name: "",
      display_name: "",
      description: "",
      requires_approval: false,
    },
  });

  const onSubmit = (values: FormValues) => {
    create.mutate(values, {
      onSuccess: () => {
        addToast({
          type: "success",
          message: "カタログ作成申請を送信しました",
        });
        onSuccess();
      },
      onError: () =>
        addToast({ type: "error", message: "カタログ作成に失敗しました" }),
    });
  };

  return (
    <ModalOverlay maxWidth="md">
      <div className="flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-900">
            カタログ作成申請
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              カタログ名（ID）<span className="text-red-500 ml-1">必須</span>
            </label>
            <input
              {...register("catalog_name")}
              placeholder="my_catalog_name"
              className="w-full h-8 px-3 text-sm border border-gray-200 rounded-md font-mono bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-teal-400"
            />
            {errors.catalog_name && (
              <p className="text-xs text-red-500 mt-1">
                {errors.catalog_name.message}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              英数字とアンダースコアのみ。作成後は変更できません。
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              表示名<span className="text-red-500 ml-1">必須</span>
            </label>
            <input
              {...register("display_name")}
              placeholder="マイカタログ"
              className="w-full h-8 px-3 text-sm border border-gray-200 rounded-md bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-teal-400"
            />
            {errors.display_name && (
              <p className="text-xs text-red-500 mt-1">
                {errors.display_name.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              説明
            </label>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="カタログの用途・概要を記述してください（Markdown 可）"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-teal-400 resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              {...register("requires_approval")}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-sm text-gray-700">
                承認フローを有効にする
              </span>
              <p className="text-xs text-gray-400 mt-0.5">
                有効にすると、閲覧申請はデータオーナーの承認を得るまで PENDING
                のままになります
              </p>
            </div>
          </label>

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <Button variant="secondary" type="button" onClick={onClose}>
              キャンセル
            </Button>
            <Button variant="primary" type="submit" loading={create.isPending}>
              作成申請
            </Button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
