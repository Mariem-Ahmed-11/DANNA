<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## DANNA roles and hospital registration

The administrative website has three account roles: `super_admin`,
`hospital_admin`, and `hospital_staff`. Account statuses are `active`, `pending`,
`rejected`, and `suspended`; hospitals use the existing `pending_review`,
`approved`, `rejected`, and `suspended` statuses. Hospital users are associated
with exactly one hospital through `users.hospital_id`.

## Hospital registration and profile

The registration form keeps hospital profile details separate from the private
administrator sign-in information. Existing required hospital name and city,
administrator name/email, and password fields remain unchanged. Contact email,
governorate, street address, descriptions, logo, website, working hours,
establishment year, location link, specialties, and services are optional. A
new registration still creates a `pending_review` hospital and `pending`
administrator; profile details do not approve or publish the hospital.

An active Hospital Admin can manage their own profile in the workspace at
`/hospital-profile`. `GET /api/hospital/profile` and
`PATCH /api/hospital/profile` derive hospital ownership from the authenticated
account. Hospital Staff and Super Admins cannot use this hospital profile
management API. The profile response deliberately excludes account users,
login email, hospital approval status, and the internal logo storage path.
Existing authenticated hospital-management responses and registration response
shapes remain unchanged. No public hospital profile API is enabled.

Hospital logos accept JPEG, PNG, or WebP up to 2 MB. The server stores only a
generated file path on the public disk and returns a storage URL to the
authenticated profile page. Create Laravel's configured public storage link
with `php artisan storage:link` after deployment, and configure `APP_URL` to
the backend's public origin so generated image URLs resolve correctly. The
hospital can replace or remove its logo. No image is required.

Hospital representatives submit a request at `/register-hospital` or by posting
hospital details and a responsible staff account to `POST /api/hospitals`.
The server creates a `pending_review` hospital and a `pending` hospital admin;
neither can sign in to the management workspace before approval. Super Admins
review `GET /api/admin/hospital-requests`, then use the corresponding
`POST /api/admin/hospitals/{id}/approve` or `/reject` action. Approved
pending Hospital Admin accounts are activated on approval. Rejection requires a
10–2000 character reason. Rejected Hospital Admins can sign in only to view the
decision and edit their hospital profile, then resubmit it at
`POST /api/hospital/rejected-registration/resubmit`; their account returns to
pending and operational access stays blocked until a new approval.

The Super Admin user directory is served by `GET /api/admin/users`; it returns
hospital users with their hospital name/status and account status. Hospital
detail data is available through the existing hospital, lifecycle-history, and
user-status-history endpoints, plus
`GET /api/admin/hospitals/{hospital}/accounts` for all hospital account states.
The existing `/api/admin/hospitals/{hospital}/users` endpoint remains limited
to suspended accounts eligible for manual activation.

Suspension also requires a reason and is performed by a Super Admin. The
additive `hospital_lifecycle_events` table records registration, approval,
rejection, suspension, reactivation, and resubmission transitions, including
the previous/new hospital status, actor, reason where relevant, and timestamp.
Super Admins can inspect the append-only application history at
`GET /api/admin/hospitals/{id}/lifecycle-history`. Restricted rejected or
suspended Hospital Admins can see only their own latest decision reason and
timestamp through `GET /api/hospital/lifecycle-status`.

Reactivation is an explicit Super Admin action at
`POST /api/admin/hospitals/{id}/reactivate`. Suspension preserves hospital,
operational, invitation, and data-review records. Only hospital admins and
staff who were active when the suspension occurred are restored; accounts
already pending, rejected, or suspended are not automatically activated.
Existing suspended hospitals have no reliable snapshot of which users were
active before suspension, so reactivation will not guess and restore those
accounts. Historical decisions from before the lifecycle-events migration are
not fabricated or backfilled because their actors and reasons are unknown.
Review the additive migration with `php artisan migrate --pretend`, then apply
it with `php artisan migrate` from the backend directory. Do not use database
reset commands.

Authenticated `GET /api/hospitals`, `GET /api/hospitals/{id}`, and
`PATCH /api/hospitals/{id}` are scoped to a hospital user's own hospital.
Super Admins can list and update all hospitals. The API independently enforces
account status, role, and hospital ownership; frontend route checks are not a
security boundary.

The additive role migration is non-destructive. Apply pending migrations using
`php artisan migrate` from the backend directory. The migrations create
Sanctum's optional personal access token table and add role, status, and
nullable hospital ownership fields to existing users. Existing user rows
receive the safe defaults `hospital_staff` and `suspended`; an administrator
must be deliberately provisioned or reviewed before access is granted. The
current project configuration uses SQLite; database connection settings remain
in `.env`.

## Incubator availability

Approved hospital admins and staff can manage their own unit capacity from the
hospital workspace at `/incubators`. The `incubator_units` table stores a unit
name, total capacity, currently available capacity, and the time availability
was last reported. The API is available under `/api/hospital/incubator-units`;
all records are scoped to the authenticated user's hospital. `hospital_id` and
the update timestamp are server-controlled, and available capacity cannot
exceed total capacity. Super Admins do not manage individual hospital unit
records through this hospital workspace API.

Availability is the hospital's last report, not a real-time guarantee. Final
patient acceptance is determined by the hospital and its medical team. Equipment
inventories are available in the hospital workspace at `/equipment`. Hospital
admins and staff can create, list, inspect, update, and delete records through
`/api/hospital/equipment`. Inventory records belong to the authenticated user's
hospital; an optional neonatal unit must belong to that same hospital. The
server controls `hospital_id` and `availability_reported_at`.

Equipment uses `shared_quantity` or `individual` tracking. Individual records
must have quantity `1`; shared quantities represent items with one common
operational and availability status. Operational statuses are `operational`,
`needs_maintenance`, `out_of_service`, and `unknown`. Availability statuses are
`available`, `in_use`, `unavailable`, and `unknown`. Reporting availability
updates the server timestamp. Notes are internal to authenticated hospital
workspace responses; there is no public equipment API. Availability does not
guarantee clinical suitability or admission.

## Hospital staff management and invitations

Only an active Hospital Admin can manage staff for their own approved hospital
from `/staff`. The page lists staff accounts and invitation states, sends
invitations, and can deactivate or reactivate existing staff. Staff and
Super Admin accounts cannot use these endpoints; role and hospital ownership
are assigned by the server, and the staff API does not expose account deletion
or Hospital Admin management.

Invitations are stored separately from users in
`hospital_staff_invitations`. The email address is unique across outstanding
and accepted invitations; an expired invitation can be reissued. The server
stores only a SHA-256 token hash, sends the plaintext token by email, and
accepts it once for 48 hours. The invitation link keeps its token in the URL
fragment so it is not sent in normal frontend HTTP requests. The invitee sets
their own password; only then is an active, email-verified `hospital_staff`
account created for the inviting hospital. Deactivated accounts use the
existing `suspended` status and are denied protected API access by the active
account middleware.

Configure a real, non-logging mail transport before sending invitations. For
example, set `MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`,
`MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, and `MAIL_FROM_NAME` in the backend
environment. Set `FRONTEND_URL` to the public frontend origin used in email
links. The invitation endpoint returns HTTP 503 when the configured mailer
logs message contents, avoiding invitation-token disclosure in application
logs. `MAIL_MAILER=log` is suitable only for local messages that contain no
secrets; it cannot be used to send staff invitations. Run
`php artisan migrate` to create the additive invitation table.

## Password management

The password recovery API uses Laravel's existing `users` password broker and
`password_reset_tokens` table. Reset tokens expire after 60 minutes and use the
broker's existing 60-second issuance throttle. `POST /api/forgot-password`
returns the same generic response for registered and unregistered addresses;
`POST /api/reset-password` accepts the token, email, password, and confirmation.
Public forgot/reset requests also have email-and-IP rate limits. Reset links
are sent to the frontend origin from `FRONTEND_URL`, with token and email in
the URL fragment rather than the HTTP query string.

Authenticated users of every role can change only their own password through
`PATCH /api/user/password`, after confirming their current password. New
passwords must contain at least 12 characters. Role, hospital association, and
account status are not accepted as update fields. Password recovery and
authenticated password changes do not sign users in or replace Sanctum
session-cookie and CSRF authentication.

Real SMTP configuration is required for password-reset delivery. When the
configured mail transport writes message contents to logs (including a
failover chain that can use the `log` transport), forgot-password requests
still receive the generic response, but no reset token is generated or
logged. Configure a non-logging mail transport as described above before
enabling this workflow.

## Hospital information review

The separate `data_review_submissions` table records review submissions for
hospital profiles, incubator unit capacity summaries, equipment descriptions,
and medical services. Each submission stores a selected information snapshot
and its hash, hospital, submitter, submission time, review status, reviewer,
decision time, and requested-change feedback. It does not duplicate internal
equipment or service notes. Existing records have no submission row and are
therefore `not_submitted`; they are not automatically approved.

Hospital admins and staff can inspect their own review statuses at
`GET /api/hospital/data-reviews` and submit an item with
`POST /api/hospital/data-reviews/{type}/{recordId}`. Super Admins use
`GET /api/admin/data-reviews` with optional `hospital_id`, `type`, and `status`
filters, inspect a submission and its history at
`GET /api/admin/data-reviews/{submission}`, and record a decision through
`POST /api/admin/data-reviews/{submission}/approve` or
`POST /api/admin/data-reviews/{submission}/request-changes`. A change request
requires a reason. A corrected item is submitted as a new record in the review
history.

Review states are `pending_review`, `approved_for_publication`, and
`changes_requested`; `not_submitted` is the absence of a submission. A
submission captures a snapshot, and approval is blocked if the reviewed
information changed after submission. Review authorization is restricted to
Super Admins; hospital submissions are scoped to the authenticated user's own
hospital. Review approval is only readiness for possible future publication:
it does not approve the hospital account, create a public API, or verify
current availability. Incubator available capacity and equipment operational
or availability statuses remain separate hospital reports with their existing
timestamps and semantics.

## DANNA SPA authentication and initial Super Admin

The React app uses Laravel Sanctum's first-party session-cookie authentication.
There is no public Super Admin or general staff account-registration endpoint,
and the default database seeder creates no users. Create the initial Super Admin
explicitly from an interactive terminal with:

```text
php artisan dhana:create-admin
```

The command prompts for an administrator name, email, password, and password
confirmation. Password input is hidden. Passwords must be at least 12
characters. Do not pass credentials as command arguments or store them in
source files or logs. The command creates an active `super_admin` and does not
reset or modify existing accounts.

For local development, this project uses `127.0.0.1` consistently: Vite at
`http://127.0.0.1:5173` and Laravel at `http://127.0.0.1:8000`. Configure
`CORS_ALLOWED_ORIGINS` with the exact frontend origin and
`SANCTUM_STATEFUL_DOMAINS` with the frontend and API host/port pairs. Do not
mix `localhost` and `127.0.0.1`; browser cookies are host-specific.

The local `.env.example` settings use HTTP, a host-only session cookie, and
`SameSite=Lax`. For production, serve both apps over HTTPS, set
`SESSION_SECURE_COOKIE=true`, keep the session cookie host-only unless a
deliberately reviewed shared parent domain is required, and set CORS and
Sanctum stateful domains to exact production hosts. Never use wildcard CORS
origins with credentialed requests.

The API login endpoint is `POST /api/login`; the authenticated identity is
available at `GET /api/user`; `POST /api/logout` ends the session. Before
mutating requests, the React client obtains `/sanctum/csrf-cookie` and sends
the XSRF token header.

## Known limitations and operational safeguards

- Equipment records may reference an incubator unit only when both belong to the
  same hospital. This relationship is validated by the application API; direct
  database edits bypass those safeguards and are outside normal application
  protections.
- Hospital deletion is not available in the current application. There is no
  supported hospital-deletion workflow or endpoint.
- Direct database deletion is not a supported workflow. Because review
  submissions reference hospitals, removing a hospital directly in the database
  could cascade-delete its data review history and should not be performed
  outside a reviewed, backed-up maintenance procedure.

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework. You can also check out [Laravel Learn](https://laravel.com/learn), where you will be guided through building a modern Laravel application.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com)**
- **[Tighten Co.](https://tighten.co)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Redberry](https://redberry.international/laravel-development)**
- **[Active Logic](https://activelogic.com)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
