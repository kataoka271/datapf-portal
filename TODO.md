# TODO

Issues found by comparing implementation against specification documents in `spec/`.

---

## Critical — Breaks in Production

- [x] **`catalog_roles` always empty in prod** (`portal/backend/app/auth.py:51-57`)
  After OIDC token verification, `catalog_roles=[]` is always returned. Per spec, Lambda must query Databricks Permissions API + `system.information_schema` to build per-catalog roles. All role-based authorization is currently disabled in prod.

- [x] **`get_catalog` has no prod branch** (`portal/backend/app/routers.py:152-153`)
  `GET /catalogs/{catalog_name}` always calls `mock.mock_catalogs()` regardless of `DEV_MODE`. Add prod branch querying `governance.catalog_definitions`.

- [x] **`get_members` has no prod branch** (`portal/backend/app/routers.py:229-238`)
  `GET /catalogs/{catalog_name}/members` always returns mock data. Prod branch must call Databricks Permissions API + IAM Identity Center to list group members.

- [x] **`create_access_request` reads mock for `requires_approval` in all modes** (`portal/backend/app/routers.py:288-290`)
  The PENDING vs APPROVED decision is based on `mock.mock_catalogs()` even in prod. Read `requires_approval` from the Delta Table instead.

- [x] **`subscribe_app` SQL syntax error** (`portal/backend/app/routers.py:470`)
  `ACTIVE` is unquoted in the INSERT VALUES clause — must be `'ACTIVE'`. Will cause a SQL parse error in prod.

- [x] **`create_unity_catalog` doesn't assign owner group or grant privileges** (`portal/backend/app/services/databricks.py:126-140`)
  Per spec: _"作成者を `catalog-owner-{catalog_name}` グループに追加し、ALL PRIVILEGES を GRANT する"_. The code only calls `w.catalogs.create()`.

---

## Missing Endpoints / Features

- [x] **`PUT /apps/{app_id}` not implemented**
  Specified in the API design doc (section 7) but absent from `routers.py` and `appsApi` in `frontend/src/api/index.ts`.

- [x] **`adminApi.listUsers()` missing from frontend** (`portal/frontend/src/api/index.ts:151-155`)
  `GET /admin/users` exists in the backend but the frontend `adminApi` object has no `listUsers()` function.

- [x] **`update_member` only handles viewer group** (`portal/backend/app/routers.py:249-252`)
  All role changes call `revoke_catalog_viewer` + `grant_catalog_viewer`. Per spec, three groups exist: `catalog-editor-{}`, `catalog-viewer-{}`, `portal-users`. Need `grant_catalog_editor` / `revoke_catalog_editor` functions in `databricks.py` and correct group selection based on the target role.

- [x] **Notifications not sent on access request** (`portal/backend/app/routers.py:275-317`)
  Per spec: when `requires_approval=true`, insert into `portal.notifications.inbox` and send SES email to data owner. Neither happens.

- [x] **Notifications not sent on approval / rejection** (`portal/backend/app/routers.py:320-347`)
  Per spec: notify the applicant on both APPROVED and REJECTED decisions. No notification or email is sent.

- [x] **App subscription notification missing** (`portal/backend/app/routers.py:459-473`)
  Per spec: _"アプリ管理者に SES メールで通知する"_ on subscription. No `db_svc.send_email()` call.

---

## Logic Bugs

- [x] **`list_notifications` double-pagination in prod** (`portal/backend/app/routers.py:56-71`)
  The SQL query already applies `LIMIT ? OFFSET ?`. The code then re-slices the result with `all_notifs[offset:offset+limit]`, and computes `total` / `unread_count` from the already-paginated page rather than the full dataset.

- [x] **`mark_all_read` always returns `updated_count: 0`** (`portal/backend/app/routers.py:97`)
  Hardcoded in both dev and prod. Return the actual row count affected.

- [x] **`send_notification` uses untyped `dict` body** (`portal/backend/app/routers.py:637-642`)
  No Pydantic validation on request body. `recipient_count` is hardcoded to 1. Add a `SendNotificationRequest` model matching spec fields (`title`, `body`, `target_user_ids`, `send_email`).

---

## Frontend / Type Inconsistencies

- [x] **`VideoInfo` missing `video_key` field** (`portal/frontend/src/types/index.ts:171-177`)
  Backend returns `video_key: str` per spec, but the frontend type omits it.

- [x] **`NotificationType` has extra `REVOCATION` value** (`portal/frontend/src/types/index.ts:117`)
  Spec defines five types: `ACCESS_REQUEST / APPROVAL / REJECTION / QUALITY_ALERT / SYSTEM_MESSAGE`. `REVOCATION` is not in the spec; remove or reconcile with backend.

---

## Known Unimplemented (Prod SQL / External APIs)

- [x] **`cross_search` prod implementation** (`portal/backend/app/routers.py:375-378`)
  Databricks Vector Search API not connected — returns mock in both modes.

- [x] **`get_statistics` prod SQL** (`portal/backend/app/routers.py:557-560`)
  `PERCENTILE_CONT` / `STDDEV` / `WIDTH_BUCKET` query not written.

- [x] **`get_vehicle_status` prod SQL** (`portal/backend/app/routers.py:517-523`)
  Spec requires dynamic column fetch from Unity Catalog tags + `system.information_schema`.

- [x] **`get_vehicle_timeseries` prod SQL** (`portal/backend/app/routers.py:526-533`)
  Spec requires dynamic JOIN query with auto-downsampling above 10,000 rows.

- [x] **JWKS caching in prod auth** (`portal/backend/app/auth.py:41-43`)
  Every request makes a synchronous `httpx.get()` to the JWKS endpoint. Cache with TTL to avoid per-request latency and rate limiting.
