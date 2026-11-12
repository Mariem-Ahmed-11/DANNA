<?php

namespace App\Support;

class PasswordResetUrl
{
    public static function make(object $user, string $token): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/reset-password?'.http_build_query([
            'token' => $token,
            'email' => $user->getEmailForPasswordReset(),
        ], '', '&', PHP_QUERY_RFC3986);
    }
}
