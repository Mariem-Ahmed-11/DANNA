# DANNA Frontend

React + Vite frontend for the DANNA neonatal care platform.

## Hospitals API

The Hospitals page uses the authenticated Laravel API.

## Shared design system

The Super Admin and Hospital workspaces use the same `AdminShell` (242px
sidebar, 66px header) and the existing dashboard design tokens in `src/App.css`.
The shared component sheet is:

| Component | Shared implementation |
| --- | --- |
| Layout, sidebar, header, language switcher, profile menu | `src/components/AdminShell.jsx` |
| Outline icon set | `src/components/Icon.jsx` |
| Cards and tables | `.sa-card`, `.sa-table`, `.sa-table-wrap` |
| Primary and secondary actions | `.sa-primary-button`, `.secondary-button` |
| Status with colored dot and text | `.sa-status-text`, `.hospital-status`, `.review-status-badge` |
| Confirmation dialogs and focus handling | `.lifecycle-dialog`, `src/useDialogA11y.js` |
| Feedback, empty states, skeletons | `.hospital-feedback`, `.sa-table-empty`, `.sa-table-skeleton-row` |

Super Admin administration routes include live analytics reports, recorded
hospital/account audit events, workspace language preferences, and the DANNA
platform information screen. Audit events are read from the append-only
hospital lifecycle and account-status history tables. The audit log screen
reads the standard Laravel paginator fields (`data`, `current_page`, and
`last_page`) and presents the server-provided events rather than sample rows.

Use the existing teal (`#0a8f9b`), amber (`#d99a2b`), rose (`#d7647a`),
white cards, 16–20px card radii, 999px primary buttons, logical spacing, and
the `dir` attribute supplied by `LocaleProvider`. At tablet widths the sidebar
collapses or becomes a drawer; list tables use stacked cards on narrow screens.
Arabic uses IBM Plex Sans Arabic, with Inter/Plus Jakarta Sans for English.
Do not add navigation or modules outside the screens in the product brief.

## Local authentication setup

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` if Laravel is not
running at `http://127.0.0.1:8000`, then restart Vite. Run the frontend at
`http://127.0.0.1:5173` and Laravel at `http://127.0.0.1:8000`. Keep the
hostname consistent: do not mix `localhost` and `127.0.0.1`, because browser
session and CSRF cookies are host-specific. Configure the Laravel
`CORS_ALLOWED_ORIGINS` and `SANCTUM_STATEFUL_DOMAINS` values to match these
origins.


Create the first authorized user through the Laravel CLI with
`php artisan dhana:create-admin`. There is no public Super Admin or general
staff account-registration endpoint. A hospital account is created only
through the pending-review workflow at `/register-hospital`. The API uses
Sanctum session cookies; the frontend requests the CSRF cookie and sends
credentials and the XSRF header for mutating requests.

For production, deploy both apps on HTTPS, configure the session cookie as
secure, and replace the local CORS and stateful domain values with exact
approved production hosts.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
