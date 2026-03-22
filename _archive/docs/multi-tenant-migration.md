

Let me also check the deployment setup and remaining models.

Here's my full assessment.

---

# Multi-Tenancy Analysis for GroupGo

## Do I agree on per-container scaling?

**Yes, unequivocally.** Past ~10 tenants the per-container model breaks down:
- Each container consumes dedicated RAM/CPU regardless of activity — you pay for idle tenants
- Deploy/upgrade cycles multiply by N (patch security fix → N rollouts)
- Nginx/Caddy vhost config becomes a growing manual config file
- Separate SQLite files = no shared caching, separate backup jobs, separate monitoring
- No cross-tenant ops (billing, usage analytics, support tooling)

It's not just unscalable — it's an operational burden that compounds with every new tenant.

---

## Approach: Row-Level Isolation (Recommended)

Three options exist for Postgres multi-tenancy:

| Approach | Isolation | Complexity | Good for |
|---|---|---|---|
| **Row-level (`tenant_id` column)** | Medium | Low | ≤ ~1000 tenants |
| **Postgres schemas per tenant** | High | High | Strict isolation needs |
| **Separate DBs per tenant** | Highest | Highest | Enterprise contracts only |

For GroupGo, **row-level isolation** is the right call. Schema-per-tenant adds enormous query routing complexity for little benefit at your scale. Separate DBs is just Docker containers again but in one Postgres instance.

---

## What Needs to Change (Beyond Postgres)

### 1. New `Tenant` model
A top-level `Tenant` table that owns everything:
```python
class Tenant(SQLModel, table=True):
    id: int
    slug: str        # "acme" → acme.groupgo.app
    name: str
    plan: str        # "free" | "pro"
    owner_user_id: int
    created_at: str
```

### 2. `tenant_id` on every scoped table
`@/home/tony/cascadeprojects/groupgo/app/models.py:10-86`

Every one of these models needs `tenant_id: int = Field(foreign_key="tenants.id", index=True)`:
- [Group](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:9:0-17:49), [User](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:20:0-50:35), [Poll](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:53:0-67:49), [Vote](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:181:0-195:49), [Showtime](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:148:0-165:49), [FetchJob](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:239:0-250:52), [UserPollPreference](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:198:0-209:49)
- **[Event](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:96:0-120:41) and [Venue](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:132:0-145:49)** — debatable. TMDB movies and theater data are natural shared catalogs. These could stay global with tenant-specific overrides, reducing redundant TMDB/SerpAPI calls

[AuthSession](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:212:0-224:68) and [MagicLinkToken](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:227:0-236:91) don't need `tenant_id` directly — they're already user-scoped and users will be tenant-scoped.

### 3. Tenant resolution middleware
Currently there's no tenant concept in the request pipeline. You need middleware that runs before every route:
- Reads subdomain from `Host` header (`acme.groupgo.app` → `acme`)
- Looks up `Tenant` by slug
- Attaches `request.state.tenant` 
- Returns 404 for unknown slugs

The current `APP_BASE_URL` in `@/home/tony/cascadeprojects/groupgo/app/config.py:8` is a single hardcoded URL — this needs to become a base domain (`groupgo.app`) plus dynamic tenant slug resolution.

### 4. Every DB query needs a tenant filter
`@/home/tony/cascadeprojects/groupgo/app/routers/api.py:1265-1435` — every `db.exec(select(Group))`, `db.exec(select(User))`, etc. currently returns ALL rows across ALL tenants. Every single query needs `.where(Model.tenant_id == tenant_id)`. That's the biggest mechanical lift in the whole migration.

### 5. Role model split
Currently `role = "admin"` means "admin of this deployment." With multi-tenancy you need:
- **`tenant_admin`** — manages their own users/groups/polls (maps to current "admin")
- **`super_admin`** — platform-level (create tenants, billing, impersonation)

The current [is_admin](cci:1://file:///home/tony/cascadeprojects/groupgo/app/models.py:47:4-50:35) property in [User](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:20:0-50:35) and all `verify_admin` calls map cleanly to tenant_admin — minimal change there. Super admin needs a new separate auth path.

### 6. PIN uniqueness scoping
`@/home/tony/cascadeprojects/groupgo/app/routers/api.py:1333-1334` — `ensure_unique_member_pin` currently enforces uniqueness across the entire DB. It needs to scope to `tenant_id`.

### 7. Replace raw SQL migrations with Alembic
`@/home/tony/cascadeprojects/groupgo/app/db.py:19-37` — `_ensure_many_to_many_tables` uses SQLite-specific `AUTOINCREMENT`, `INSERT OR IGNORE`, and raw DDL. This needs to be replaced with **Alembic** before any of the above work starts. This is your biggest existing technical debt.

---

## What's Already Well-Positioned

The data model is actually cleaner than most pre-multitenancy apps at this stage:
- [Group](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:9:0-17:49) → [UserGroup](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:70:0-76:47) → [PollGroup](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:79:0-85:47) M2M is solid and tenant-scoping maps naturally on top
- Service layer is modular enough to add `tenant_id` parameters without rewrites
- [AuthSession](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:212:0-224:68)/[MagicLinkToken](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:227:0-236:91) are already server-side and user-scoped — no structural changes needed
- [ShowtimeCache](cci:2://file:///home/tony/cascadeprojects/groupgo/app/models.py:168:0-178:59) is already designed as a shared global cache — keep it that way across tenants to minimize SerpAPI spend

---

## Migration Plan

**Phase 1 — Postgres + Alembic (no feature change)**
1. Add `alembic` to deps, generate initial migration from current SQLite schema
2. Swap `DATABASE_URL` to Postgres, remove `check_same_thread` and SQLite pragmas from `db.py`
3. Replace `_ensure_many_to_many_tables` raw SQL with an Alembic migration
4. Full regression test — behavior identical to today

**Phase 2 — Tenant model + data scoping**
1. Add `Tenant` table + `tenant_id` FK to all scoped models via Alembic migration
2. Seed existing data under a `tenant_id=1` "default" tenant
3. Add tenant-resolution middleware
4. Scope all queries in `api.py` and service layer — this is the biggest lift (~100-150 query sites)
5. Scope `ensure_unique_member_pin` to tenant
6. Update `init_db` seed to become per-tenant onboarding

**Phase 3 — Tenant admin surface**
1. Add super_admin role + protected routes for tenant creation/management
2. Tenant onboarding flow (create tenant → seed admin user → send magic link)
3. Subdomain routing in Nginx/Caddy (wildcard cert + `*.groupgo.app` → single app)

**Phase 4 — Product & ops**
1. Tenant settings page (name, plan, theater preferences)
2. Billing/plan gating hooks
3. Per-tenant usage metrics

---

## Honest Assessment of Effort

- **Phase 1**: ~1-2 days, low risk
- **Phase 2**: 3-5 days — the query scoping is mechanical but extensive given the size of `api.py`
- **Phase 3**: 2-3 days
- **Phase 4**: ongoing

The biggest risk is Phase 2: it's easy to miss a query site and accidentally leak cross-tenant data. A good mitigation is writing a middleware-level default filter (SQLAlchemy's `with_loader_criteria` or a custom base query helper) that injects `tenant_id` automatically, so forgetting it results in a query error rather than silent data leakage.