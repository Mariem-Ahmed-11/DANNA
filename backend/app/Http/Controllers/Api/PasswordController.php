<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\MailTransportSafety;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class PasswordController extends Controller
{
    public function forgot(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
        ]);
        $email = mb_strtolower(trim($validated['email']));

        if (! MailTransportSafety::writesToLogs()) {
            try {
                $status = Password::broker()->sendResetLink(['email' => $email]);

                Log::info('Password reset broker completed.', [
                    'stage' => 'password_broker_send_reset_link',
                    'outcome' => $this->passwordResetOutcome($status),
                ]);
            } catch (\Throwable $exception) {
                DB::table('password_reset_tokens')->where('email', $email)->delete();

                Log::error('Password reset dispatch failed.', [
                    'stage' => 'password_broker_send_reset_link',
                    'exception_type' => $exception::class,
                    'smtp_reply_code' => $this->smtpReplyCode($exception),
                ]);

                return response()->json([
                    'message' => 'The reset email could not be sent. Try again in a few minutes.',
                ], 503);
            }
        } else {
            Log::warning('Password reset dispatch skipped because the mail transport writes messages to logs.', [
                'stage' => 'mail_transport_safety',
                'outcome' => 'skipped_log_mailer',
            ]);
        }

        return response()->json([
            'message' => 'If an account exists for that email, a password reset link will be sent.',
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', PasswordRule::min(12), 'confirmed'],
            'password_confirmation' => ['required', 'string'],
        ]);
        $validated['email'] = mb_strtolower(trim($validated['email']));

        $status = Password::broker()->reset(
            $validated,
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();

                $this->invalidateUserSessions($user);

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => ['This password reset link is invalid, expired, or has already been used.'],
            ]);
        }

        return response()->json([
            'message' => 'Your password has been reset. Sign in with your new password.',
        ]);
    }

    public function change(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => [
                'required',
                'string',
                PasswordRule::min(12),
                'confirmed',
                'different:current_password',
            ],
        ]);

        if (! Hash::check($validated['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $currentSessionId = $request->hasSession()
            ? $request->session()->getId()
            : null;

        DB::transaction(function () use ($request, $validated, $currentSessionId): void {
            $request->user()->forceFill([
                'password' => $validated['password'],
            ])->save();

            $this->invalidateUserSessions($request->user(), $currentSessionId);
        });

        return response()->json([
            'message' => 'Your password has been changed.',
        ]);
    }

    private function passwordResetOutcome(string $status): string
    {
        return match ($status) {
            Password::RESET_LINK_SENT => 'sent',
            Password::RESET_THROTTLED => 'throttled',
            Password::INVALID_USER => 'invalid_user',
            default => 'unknown',
        };
    }

    private function smtpReplyCode(\Throwable $exception): ?int
    {
        $diagnostic = $exception->getMessage();

        if (method_exists($exception, 'getDebug')) {
            $diagnostic .= "\n".$exception->getDebug();
        }

        if (preg_match('/got code ["\']?([45]\d{2})/i', $diagnostic, $matches)
            || preg_match('/^\s*<\s*([45]\d{2})[ -]/m', $diagnostic, $matches)) {
            return (int) $matches[1];
        }

        return null;
    }

    private function invalidateUserSessions(User $user, ?string $exceptSessionId = null): void
    {
        $query = DB::table('sessions')->where('user_id', $user->id);

        if ($exceptSessionId !== null) {
            $query->where('id', '!=', $exceptSessionId);
        }

        $query->delete();
    }
}
