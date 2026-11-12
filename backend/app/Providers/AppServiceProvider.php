<?php

namespace App\Providers;

use App\Support\PasswordResetUrl;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return Limit::perMinute(5)->by(
                Str::transliterate($email.'|'.$request->ip())
            );
        });

        RateLimiter::for('password-forgot', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return Limit::perMinute(3)->by(
                Str::transliterate($email.'|'.$request->ip())
            );
        });

        RateLimiter::for('password-reset', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return Limit::perMinute(5)->by(
                Str::transliterate($email.'|'.$request->ip())
            );
        });

        ResetPassword::createUrlUsing(
            fn (object $user, string $token): string => PasswordResetUrl::make($user, $token)
        );

        ResetPassword::toMailUsing(function (object $user, string $token): MailMessage {
            $minutes = (int) config('auth.passwords.'.config('auth.defaults.passwords').'.expire');

            return (new MailMessage)
                ->subject('DANNA password reset / إعادة تعيين كلمة مرور DANNA')
                ->greeting('Hello / مرحبًا')
                ->line('You are receiving this email because we received a password reset request for your DANNA account.')
                ->line('تلقّيت هذا البريد لأننا استلمنا طلبًا لإعادة تعيين كلمة مرور حساب DANNA.')
                ->action('Reset password / إعادة تعيين كلمة المرور', PasswordResetUrl::make($user, $token))
                ->line("This link expires in {$minutes} minutes and can be used only once.")
                ->line("ينتهي هذا الرابط خلال {$minutes} دقيقة ويمكن استخدامه مرة واحدة فقط.")
                ->line('If you did not request a password reset, no further action is required.')
                ->line('إذا لم تطلب إعادة تعيين كلمة المرور، فلا حاجة لأي إجراء.');
        });
    }
}
