# DHANA

DHANA is a Laravel 12 and React administration application for neonatal-care hospital operations. Authentication uses Laravel Sanctum session cookies; no credentials or session tokens are stored by the frontend.

## Requirements

- Node.js 20 or later
- PHP 8.2 or later, with the SQLite extension enabled
- XAMPP is supported. Its default PHP executable is `C:\xampp\php\php.exe`.

## Install and configure

Install the frontend packages:

```powershell
cd frontend
npm install
```

Install backend dependencies if `backend/vendor` is absent:

```powershell
cd backend
composer install
```

Copy `backend/.env.example` to `backend/.env` if needed, then set `APP_KEY` (for example, with `php artisan key:generate`). The included configuration uses `backend/database/database.sqlite`; do not recreate or reset that database. Confirm the following local values match the documented ports:

```env
APP_URL=http://127.0.0.1:8000
FRONTEND_URL=http://127.0.0.1:5173
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173
SANCTUM_STATEFUL_DOMAINS=127.0.0.1:5173,127.0.0.1:8000
```

## Start development

From this project root, run:

```powershell
npm run dev
```

This starts Laravel at `http://127.0.0.1:8000` and Vite at `http://127.0.0.1:5173`, with each server’s output labelled in the same terminal. Press `Ctrl+C` once to stop both processes. On Windows, the startup script terminates child process trees so PHP’s development server is not left running.

The script checks both ports before it starts. If a port is occupied, stop the process using that port and run the command again. It first uses `DANNA_PHP`, then `PHP_EXECUTABLE`, then XAMPP’s default PHP path, and finally `php` on `PATH`. For a custom installation:

```powershell
$env:DANNA_PHP = 'D:\\tools\\php\\php.exe'
npm run dev
```

If Vite is reported missing, run `npm install` in `frontend`. If PHP is not found, set one of the variables above or install/enable PHP. If login cannot connect, use `127.0.0.1` for both addresses rather than mixing it with `localhost`, then verify the backend environment values above.

## Language support

Arabic is the default language. Use the language selector to switch to English; the choice is saved in browser local storage and restored after refresh. The application updates the document `lang` and `dir` attributes immediately, using RTL for Arabic and LTR for English.

## Verification and production build

Run backend checks from `backend`:

```powershell
php artisan test
php vendor/bin/pint --test
```

Run frontend checks from `frontend`:

```powershell
npm run lint
npm run build
```

The frontend production build is produced by `npm run build` in `frontend`. The API configuration remains same-origin in production when `VITE_API_BASE_URL` is not configured.
