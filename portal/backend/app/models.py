from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field
import uuid


def new_id() -> str:
    return str(uuid.uuid4())


# ── Auth ──────────────────────────────────────────────────────────────────────
class CatalogRole(BaseModel):
    catalog_name: str
    role: str  # owner | editor | viewer | user


class CurrentUser(BaseModel):
    user_id: str
    email: str
    display_name: str
    catalog_roles: list[CatalogRole] = []
    is_admin: bool = False


# ── Catalog ───────────────────────────────────────────────────────────────────
class SchemaInfo(BaseModel):
    schema_name: str
    table_count: int = 0


class CatalogItem(BaseModel):
    catalog_name: str
    display_name: str
    description: str = ""
    owner_user_id: str
    my_role: str = "none"
    my_request_status: Optional[str] = None
    requires_approval: bool = False
    status: str = "ACTIVE"
    mou_version: str = "v1"
    updated_at: datetime


class CatalogDetail(CatalogItem):
    schemas: list[SchemaInfo] = []


class CreateCatalogRequest(BaseModel):
    catalog_name: str = Field(pattern=r"^[a-zA-Z0-9_]+$")
    display_name: str
    description: str = ""
    requires_approval: bool = False


# ── MOU ───────────────────────────────────────────────────────────────────────
class ChecklistItem(BaseModel):
    item_id: str = Field(default_factory=new_id)
    label: str
    required: bool = False


class MouDefinition(BaseModel):
    catalog_name: str
    version: str
    mou_text: str
    checklist: list[ChecklistItem] = []
    updated_at: datetime


class UpdateMouRequest(BaseModel):
    mou_text: str
    checklist: list[dict[str, Any]]


# ── Members ───────────────────────────────────────────────────────────────────
class CatalogMember(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    approved_at: datetime


class UpdateMemberRequest(BaseModel):
    role: str


# ── Access request ────────────────────────────────────────────────────────────
class ChecklistResponse(BaseModel):
    item_id: str
    checked: bool


class CreateAccessRequestBody(BaseModel):
    mou_version: str
    checklist_responses: list[ChecklistResponse]


class AccessRequestItem(BaseModel):
    agreement_id: str
    user_id: str
    display_name: str
    email: str
    mou_version: str
    status: str
    agreed_at: datetime
    decided_at: Optional[datetime] = None


class DecideAccessRequest(BaseModel):
    action: str  # approve | reject
    notes: Optional[str] = None


# ── Search ────────────────────────────────────────────────────────────────────
class MatchedColumn(BaseModel):
    catalog_name: str
    schema_name: str
    table_name: str
    column_name: str
    description: str = ""
    tags: list[str] = []
    score: float


class SearchRequest(BaseModel):
    query: str
    catalog_names: Optional[list[str]] = None
    time_from: Optional[str] = None
    time_to: Optional[str] = None
    limit: int = 100


class SearchResult(BaseModel):
    matched_columns: list[MatchedColumn]
    preview_rows: list[dict[str, Any]]
    join_key: str = "vehicle_id + timestamp"


class SaveViewRequest(BaseModel):
    view_name: str
    target_schema: str
    matched_columns: list[MatchedColumn]
    time_from: Optional[str] = None
    time_to: Optional[str] = None


class SavedView(BaseModel):
    view_id: str
    view_full_name: str
    ddl: str
    description: str = ""
    status: str = "ACTIVE"
    created_at: datetime


# ── Apps ──────────────────────────────────────────────────────────────────────
class DataApp(BaseModel):
    app_id: str
    name: str
    description: str = ""
    owner_user_id: str
    used_catalogs: list[str] = []
    is_subscribed: bool = False
    redirect_url: Optional[str] = None


class CreateAppRequest(BaseModel):
    name: str
    description: str = ""
    redirect_url: str
    used_catalog_names: list[str]
    published_catalog_names: list[str] = []
    cognito_user_pool_arn: Optional[str] = None
    cognito_region: Optional[str] = None


# ── Notifications ─────────────────────────────────────────────────────────────
class NotificationItem(BaseModel):
    notification_id: str
    type: str
    title: str
    body: str
    related_catalog: Optional[str] = None
    related_entity_id: Optional[str] = None
    is_read: bool = False
    created_at: datetime


class NotificationsResponse(BaseModel):
    total: int
    unread_count: int
    items: list[NotificationItem]


# ── Analysis ──────────────────────────────────────────────────────────────────
class VehiclePoint(BaseModel):
    vehicle_id: str
    latitude: float
    longitude: float
    heading: float = 0.0
    speed_kmh: float
    recorded_at: datetime


class StatusField(BaseModel):
    column_name: str
    display_name: str
    value: Any
    unit: Optional[str] = None


class VehicleStatus(BaseModel):
    vehicle_id: str
    recorded_at: datetime
    status_fields: list[StatusField]
    has_video: bool = False


class TimeseriesPoint(BaseModel):
    timestamp: str
    value: float


class TimeseriesSeries(BaseModel):
    column_full_name: str
    display_name: str
    unit: Optional[str] = None
    data: list[TimeseriesPoint]


class VehiclesRequest(BaseModel):
    region: str
    at_time: str
    time_tolerance_sec: int = 30


class TimeseriesRequest(BaseModel):
    columns: list[str]
    time_from: str
    time_to: str
    downsample_interval_sec: int = 1


class StatisticsRequest(BaseModel):
    region: str
    time_from: str
    time_to: str
    columns: list[str]


class HistogramBin(BaseModel):
    bin_start: float
    bin_end: float
    count: int


class StatResult(BaseModel):
    column_full_name: str
    display_name: str
    count: int
    null_count: int
    mean: float
    stddev: float
    min: float
    p25: float
    p50: float
    p75: float
    max: float
    histogram: list[HistogramBin]


# ── Alerts ────────────────────────────────────────────────────────────────────
class QualityAlert(BaseModel):
    alert_id: str
    catalog_name: str
    table_full_name: str
    metric_name: str
    severity: str
    status: str
    threshold: Optional[float] = None
    actual_value: Optional[float] = None
    detail_message: Optional[str] = None
    monitoring_run_id: Optional[str] = None
    triggered_at: datetime
    resolved_at: Optional[datetime] = None


# ── Pagination ────────────────────────────────────────────────────────────────
class PaginatedResponse(BaseModel):
    total: int
    items: list[Any]
