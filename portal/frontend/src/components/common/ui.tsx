import { type ReactNode, useEffect } from "react";
import { clsx } from "clsx";
import type {
  NotificationType,
  AlertSeverity,
  AlertStatus,
  UserRole,
  RequestStatus,
} from "@/types";

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" && "px-2.5 py-1 text-xs",
        size === "md" && "px-3 py-1.5 text-sm",
        variant === "primary" &&
          "bg-teal-600 border-teal-700 text-white hover:bg-teal-700",
        variant === "secondary" &&
          "bg-white border-gray-200 text-gray-700 hover:bg-gray-50",
        variant === "danger" &&
          "bg-white border-red-300 text-red-700 hover:bg-red-50",
        variant === "ghost" &&
          "border-transparent text-gray-600 hover:bg-gray-100",
        className,
      )}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
type BadgeVariant = "green" | "amber" | "red" | "blue" | "gray" | "purple";

export function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        variant === "green" && "bg-green-100 text-green-800",
        variant === "amber" && "bg-amber-100 text-amber-800",
        variant === "red" && "bg-red-100 text-red-800",
        variant === "blue" && "bg-blue-100 text-blue-800",
        variant === "gray" && "bg-gray-100 text-gray-700",
        variant === "purple" && "bg-purple-100 text-purple-800",
      )}
    >
      {children}
    </span>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
export function RoleBadge({ role }: { role: UserRole }) {
  const map: Record<UserRole, { label: string; variant: BadgeVariant }> = {
    owner: { label: "オーナー", variant: "purple" },
    editor: { label: "編集者", variant: "blue" },
    viewer: { label: "閲覧者", variant: "green" },
    user: { label: "一般", variant: "gray" },
    none: { label: "未申請", variant: "gray" },
  };
  const { label, variant } = map[role];
  return <Badge variant={variant}>{label}</Badge>;
}

// ── Request status badge ──────────────────────────────────────────────────────
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  if (!status) return <Badge variant="gray">未申請</Badge>;
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    PENDING: { label: "審査中", variant: "amber" },
    APPROVED: { label: "閲覧中", variant: "green" },
    REJECTED: { label: "却下済み", variant: "red" },
    REVOKED: { label: "解除済み", variant: "gray" },
  };
  const { label, variant } = map[status] ?? {
    label: status,
    variant: "gray" as BadgeVariant,
  };
  return <Badge variant={variant}>{label}</Badge>;
}

// ── Alert severity badge ──────────────────────────────────────────────────────
export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const map: Record<AlertSeverity, { label: string; variant: BadgeVariant }> = {
    HIGH: { label: "HIGH", variant: "red" },
    MEDIUM: { label: "MEDIUM", variant: "amber" },
    LOW: { label: "LOW", variant: "blue" },
  };
  const { label, variant } = map[severity];
  return <Badge variant={variant}>{label}</Badge>;
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return (
    <Badge variant={status === "OPEN" ? "red" : "green"}>
      {status === "OPEN" ? "OPEN" : "RESOLVED"}
    </Badge>
  );
}

// ── Notification type icon ────────────────────────────────────────────────────
export function NotifIcon({ type }: { type: NotificationType }) {
  const cfg: Record<
    NotificationType,
    { bg: string; fg: string; path: string }
  > = {
    ACCESS_REQUEST: {
      bg: "bg-blue-100",
      fg: "text-blue-700",
      path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    APPROVAL: {
      bg: "bg-green-100",
      fg: "text-green-700",
      path: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    REJECTION: {
      bg: "bg-red-100",
      fg: "text-red-700",
      path: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    REVOCATION: {
      bg: "bg-gray-100",
      fg: "text-gray-600",
      path: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
    },
    QUALITY_ALERT: {
      bg: "bg-amber-100",
      fg: "text-amber-700",
      path: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    },
    SYSTEM_MESSAGE: {
      bg: "bg-purple-100",
      fg: "text-purple-700",
      path: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
    },
  };
  const { bg, fg, path } = cfg[type];
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0",
        bg,
        fg,
      )}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </span>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("animate-spin h-5 w-5 text-teal-600", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && (
        <p className="text-xs text-gray-500 mt-1 max-w-xs">{description}</p>
      )}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("animate-pulse bg-gray-200 rounded", className)} />
  );
}

// ── Toast container ───────────────────────────────────────────────────────────
import { useUIStore } from "@/stores";

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function Toast({
  type,
  message,
  onClose,
}: {
  type: "success" | "error" | "info";
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, 4000);
    return () => clearTimeout(id);
  }, [onClose]);

  return (
    <div
      className={clsx(
        "pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg shadow text-sm font-medium",
        type === "success" && "bg-green-600 text-white",
        type === "error" && "bg-red-600 text-white",
        type === "info" && "bg-blue-600 text-white",
      )}
    >
      {message}
      <button
        onClick={onClose}
        className="ml-1 opacity-70 hover:opacity-100 text-white"
      >
        ✕
      </button>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-medium text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onCancel}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            確認
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-medium text-gray-900">{title}</h1>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
