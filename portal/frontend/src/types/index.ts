// ── Auth ──────────────────────────────────────────────────────────────────────
export interface CatalogRole {
  catalog_name: string;
  role: "owner" | "editor" | "viewer" | "user";
}

export interface CurrentUser {
  user_id: string;
  email: string;
  display_name: string;
  catalog_roles: CatalogRole[];
  is_admin: boolean;
}

// ── Catalog ───────────────────────────────────────────────────────────────────
export type RequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REVOKED"
  | null;
export type CatalogStatus = "ACTIVE" | "SUSPENDED";
export type UserRole = "owner" | "editor" | "viewer" | "user" | "none";

export interface Catalog {
  catalog_name: string;
  display_name: string;
  description: string;
  owner_user_id: string;
  my_role: UserRole;
  my_request_status: RequestStatus;
  requires_approval: boolean;
  status: CatalogStatus;
  mou_version: string;
  updated_at: string;
}

export interface CatalogDetail extends Catalog {
  schemas: SchemaInfo[];
}

export interface SchemaInfo {
  schema_name: string;
  table_count: number;
}

export interface ChecklistItem {
  item_id: string;
  label: string;
  required: boolean;
}

export interface MouDefinition {
  catalog_name: string;
  version: string;
  mou_text: string;
  checklist: ChecklistItem[];
  updated_at: string;
}

export interface CatalogMember {
  user_id: string;
  email: string;
  display_name: string;
  role: "editor" | "viewer" | "user";
  approved_at: string;
}

export interface AccessRequest {
  agreement_id: string;
  user_id: string;
  display_name: string;
  email: string;
  mou_version: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  agreed_at: string;
  decided_at: string | null;
}

// ── Search ────────────────────────────────────────────────────────────────────
export interface MatchedColumn {
  catalog_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  description: string;
  tags: string[];
  score: number;
}

export interface SearchResult {
  matched_columns: MatchedColumn[];
  preview_rows: Record<string, unknown>[];
  join_key: string;
}

export interface SavedView {
  view_id: string;
  view_full_name: string;
  ddl: string;
  description: string;
  created_at: string;
  status: "ACTIVE" | "DROPPED";
}

// ── Apps ──────────────────────────────────────────────────────────────────────
export interface DataApp {
  app_id: string;
  name: string;
  description: string;
  owner_user_id: string;
  used_catalogs: string[];
  is_subscribed: boolean;
  redirect_url?: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────
export type NotificationType =
  | "ACCESS_REQUEST"
  | "APPROVAL"
  | "REJECTION"
  | "QUALITY_ALERT"
  | "SYSTEM_MESSAGE";

export interface Notification {
  notification_id: string;
  type: NotificationType;
  title: string;
  body: string;
  related_catalog: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  total: number;
  unread_count: number;
  items: Notification[];
}

// ── Analysis ──────────────────────────────────────────────────────────────────
export type Region = "japan" | "europe" | "north_america";

export interface VehiclePoint {
  vehicle_id: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed_kmh: number;
  recorded_at: string;
}

export interface StatusField {
  column_name: string;
  display_name: string;
  value: unknown;
  unit: string | null;
}

export interface VehicleStatus {
  vehicle_id: string;
  recorded_at: string;
  status_fields: StatusField[];
  has_video: boolean;
}

export interface TimeseriesSeries {
  column_full_name: string;
  display_name: string;
  unit: string | null;
  data: { timestamp: string; value: number }[];
}

export interface VideoInfo {
  vehicle_id: string;
  video_key: string;
  presigned_url: string;
  expires_at: string;
  duration_sec: number;
  recorded_at: string;
}

export interface StatResult {
  column_full_name: string;
  display_name: string;
  count: number;
  null_count: number;
  mean: number;
  stddev: number;
  min: number;
  p25: number;
  p50: number;
  p75: number;
  max: number;
  histogram: { bin_start: number; bin_end: number; count: number }[];
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";
export type AlertStatus = "OPEN" | "RESOLVED";

export interface QualityAlert {
  alert_id: string;
  catalog_name: string;
  table_full_name: string;
  metric_name: string;
  severity: AlertSeverity;
  status: AlertStatus;
  threshold: number | null;
  actual_value: number | null;
  detail_message: string | null;
  triggered_at: string;
  resolved_at: string | null;
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  catalog_count: number;
  last_login_at: string;
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  total: number;
  items: T[];
}
