<?php

namespace App\Support;

class MailTransportSafety
{
    public static function writesToLogs(?string $mailer = null): bool
    {
        $mailer ??= config('mail.default');
        $visited = [];

        while ($mailer && ! in_array($mailer, $visited, true)) {
            if ($mailer === 'log') {
                return true;
            }

            $visited[] = $mailer;
            $fallbacks = config("mail.mailers.{$mailer}.mailers", []);
            $mailer = in_array('log', $fallbacks, true) ? 'log' : ($fallbacks[0] ?? null);
        }

        return false;
    }
}
