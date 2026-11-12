<?php

use App\Models\Hospital;
use App\Models\User;
use App\Support\PasswordResetUrl;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\Mailer\Exception\TransportException;

uses(RefreshDatabase::class);

function createPasswordManagementUser(string $role = 'super_admin'): User
{
    $hospital = null;
    if ($role !== 'super_admin') {
        $hospital = Hospital::query()->create([
            'name' => ucfirst(str_replace('_', ' ', $role)).' Password Hospital',
            'city' => 'Password City',
        ]);
        $hospital->forceFill(['status' => 'approved'])->save();
    }

    $user = User::factory()->create([
        'email' => $role.'-password@example.test',
        'password' => 'current-password-123',
    ]);
    $user->forceFill([
        'role' => $role,
        'status' => 'active',
        'hospital_id' => $hospital?->id,
    ])->save();

    return $user;
}

function requestPasswordResetToken(User $user): string
{
    Notification::fake();

    test()->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertOk()
        ->assertJsonMissingPath('token');

    $token = null;
    Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use (&$token) {
        $token = $notification->token;

        return filled($token);
    });

    return $token;
}

function createDatabaseSession(string $id, ?int $userId = null): void
{
    DB::table('sessions')->insert([
        'id' => $id,
        'user_id' => $userId,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'PHPUnit',
        'payload' => base64_encode(serialize([])),
        'last_activity' => now()->timestamp,
    ]);
}

test('forgot password sends a broker reset notification and returns no reset token', function () {
    $user = createPasswordManagementUser();
    Notification::fake();

    $this->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertOk()
        ->assertJsonPath('message', 'If an account exists for that email, a password reset link will be sent.')
        ->assertJsonMissingPath('token')
        ->assertJsonMissingPath('password');

    Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user) {
        $mail = $notification->toMail($user);
        $resetUrl = PasswordResetUrl::make($user, $notification->token);

        expect($mail->actionUrl)->toBe($resetUrl)
            ->and($resetUrl)->toStartWith('http://127.0.0.1:5173/reset-password?')
            ->and($resetUrl)->toContain('token=')
            ->and($resetUrl)->toContain('email='.rawurlencode($user->email))
            ->and($resetUrl)->not->toContain('#');

        return filled($notification->token);
    });
    $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
});

test('forgot password synchronously sends the reset notification to the account email', function () {
    $user = createPasswordManagementUser();
    Mail::fake();

    $sentNotification = null;
    Event::listen(NotificationSent::class, function (NotificationSent $event) use (&$sentNotification): void {
        if ($event->notification instanceof ResetPassword) {
            $sentNotification = $event;
        }
    });

    $this->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertOk();

    expect($sentNotification)->not->toBeNull()
        ->and($sentNotification->notifiable->getKey())->toBe($user->getKey())
        ->and($sentNotification->channel)->toBe('mail')
        ->and($sentNotification->notifiable->routeNotificationFor('mail', $sentNotification->notification))
        ->toBe($user->email);
});

test('forgot password delivery failures do not leave a reusable token or expose it', function () {
    $user = createPasswordManagementUser();
    $originalMailCallback = ResetPassword::$toMailCallback;
    Log::spy();
    ResetPassword::toMailUsing(function () {
        throw new RuntimeException('SMTP transport unavailable.');
    });

    try {
        $response = $this->postJson('/api/forgot-password', ['email' => $user->email])
            ->assertServiceUnavailable()
            ->assertJsonPath('message', 'The reset email could not be sent. Try again in a few minutes.')
            ->assertJsonMissingPath('token')
            ->assertJsonMissingPath('password');

        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertStringNotContainsString('SMTP transport unavailable.', $response->getContent());
        Log::shouldHaveReceived('error')
            ->once()
            ->withArgs(function (string $message, array $context): bool {
                return $message === 'Password reset dispatch failed.'
                    && $context['stage'] === 'password_broker_send_reset_link'
                    && $context['exception_type'] === RuntimeException::class
                    && $context['smtp_reply_code'] === null
                    && ! array_key_exists('email', $context)
                    && ! array_key_exists('token', $context);
            });
    } finally {
        ResetPassword::$toMailCallback = $originalMailCallback;
    }
});

test('forgot password records only the SMTP reply code from transport errors', function () {
    $user = createPasswordManagementUser();
    $originalMailCallback = ResetPassword::$toMailCallback;
    Log::spy();
    ResetPassword::toMailUsing(function () {
        throw new TransportException(
            'Expected response code "250" but got code "550", with message "private-recipient@example.test".'
        );
    });

    try {
        $response = $this->postJson('/api/forgot-password', ['email' => $user->email])
            ->assertServiceUnavailable();

        $this->assertStringNotContainsString('private-recipient@example.test', $response->getContent());
        Log::shouldHaveReceived('error')
            ->once()
            ->withArgs(function (string $message, array $context): bool {
                return $message === 'Password reset dispatch failed.'
                    && $context['exception_type'] === TransportException::class
                    && $context['smtp_reply_code'] === 550
                    && ! array_key_exists('email', $context)
                    && ! array_key_exists('token', $context);
            });
    } finally {
        ResetPassword::$toMailCallback = $originalMailCallback;
    }
});

test('forgot password records a throttled broker result without exposing account details', function () {
    $user = createPasswordManagementUser();
    Notification::fake();

    $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

    Log::spy();
    $this->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertOk()
        ->assertJsonPath('message', 'If an account exists for that email, a password reset link will be sent.');

    Log::shouldHaveReceived('info')
        ->once()
        ->withArgs(function (string $message, array $context): bool {
            return $message === 'Password reset broker completed.'
                && $context['stage'] === 'password_broker_send_reset_link'
                && $context['outcome'] === 'throttled'
                && ! array_key_exists('email', $context)
                && ! array_key_exists('token', $context);
        });
});

test('forgot password returns the same generic response for an unknown email', function () {
    $this->postJson('/api/forgot-password', ['email' => 'unknown@example.test'])
        ->assertOk()
        ->assertJsonPath('message', 'If an account exists for that email, a password reset link will be sent.')
        ->assertJsonMissingPath('token');

    $this->assertDatabaseCount('password_reset_tokens', 0);
});

test('forgot password validates email and rate limits requests', function () {
    $this->postJson('/api/forgot-password', ['email' => 'invalid-email'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);

    RateLimiter::clear('password-reset:'.sha1('ratelimit@example.test|127.0.0.1'));
    foreach (range(1, 3) as $attempt) {
        $this->postJson('/api/forgot-password', ['email' => 'ratelimit@example.test'])->assertOk();
    }
    $this->postJson('/api/forgot-password', ['email' => 'ratelimit@example.test'])
        ->assertTooManyRequests();
});

test('a valid broker reset token changes the password and preserves account authorization data', function () {
    $user = createPasswordManagementUser('hospital_staff');
    $token = requestPasswordResetToken($user);
    $oldHospitalId = $user->hospital_id;

    $this->postJson('/api/reset-password', [
        'token' => $token,
        'email' => $user->email,
        'password' => 'new-secure-password-456',
        'password_confirmation' => 'new-secure-password-456',
        'role' => 'super_admin',
        'hospital_id' => null,
        'status' => 'suspended',
    ])
        ->assertOk()
        ->assertJsonMissingPath('token')
        ->assertJsonMissingPath('password');

    $user->refresh();
    expect(Hash::check('new-secure-password-456', $user->password))->toBeTrue()
        ->and($user->role)->toBe('hospital_staff')
        ->and($user->status)->toBe('active')
        ->and($user->hospital_id)->toBe($oldHospitalId);
    $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);

    $this->withHeaders(['Origin' => 'http://127.0.0.1:5173'])
        ->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'new-secure-password-456',
        ])
        ->assertOk()
        ->assertJsonPath('user.id', $user->id);
});

test('invalid, expired, reused and mismatched reset tokens are rejected', function () {
    $user = createPasswordManagementUser();
    $token = requestPasswordResetToken($user);

    $this->postJson('/api/reset-password', [
        'token' => 'invalid-token',
        'email' => $user->email,
        'password' => 'new-secure-password-456',
        'password_confirmation' => 'new-secure-password-456',
    ])->assertUnprocessable();

    $this->postJson('/api/reset-password', [
        'token' => $token,
        'email' => $user->email,
        'password' => 'new-secure-password-456',
        'password_confirmation' => 'different-secure-password',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);

    $this->travel(61)->minutes();
    $this->postJson('/api/reset-password', [
        'token' => $token,
        'email' => $user->email,
        'password' => 'new-secure-password-456',
        'password_confirmation' => 'new-secure-password-456',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);
    expect(Hash::check('current-password-123', $user->fresh()->password))->toBeTrue();

    $this->travelBack();
});

test('a successfully used password reset token cannot be reused', function () {
    $user = createPasswordManagementUser();
    $token = requestPasswordResetToken($user);
    $payload = [
        'token' => $token,
        'email' => $user->email,
        'password' => 'new-secure-password-456',
        'password_confirmation' => 'new-secure-password-456',
    ];

    $this->postJson('/api/reset-password', $payload)->assertOk();
    $this->postJson('/api/reset-password', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);
});

test('change password requires authentication and validates current password and confirmation', function () {
    $this->patchJson('/api/user/password', [
        'current_password' => 'current-password-123',
        'password' => 'new-secure-password-456',
        'password_confirmation' => 'new-secure-password-456',
    ])->assertUnauthorized();

    $user = createPasswordManagementUser();
    $response = $this->actingAs($user)
        ->patchJson('/api/user/password', [
            'current_password' => 'incorrect-current-password',
            'password' => 'new-secure-password-456',
            'password_confirmation' => 'new-secure-password-456',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['current_password']);

    $this->patchJson('/api/user/password', [
        'current_password' => 'current-password-123',
        'password' => 'new-secure-password-456',
        'password_confirmation' => 'different-secure-password',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);

    $this->patchJson('/api/user/password', [
        'current_password' => 'current-password-123',
        'password' => 'current-password-123',
        'password_confirmation' => 'current-password-123',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);

    expect(Hash::check('current-password-123', $user->fresh()->password))->toBeTrue();
});

test('all account roles can change only their own password without changing role or hospital', function () {
    foreach (['super_admin', 'hospital_admin', 'hospital_staff'] as $role) {
        Auth::forgetGuards();
        $user = createPasswordManagementUser($role);
        $otherUser = User::factory()->create([
            'email' => 'other-'.$role.'@example.test',
            'password' => 'other-current-password-123',
        ]);
        $original = $user->only(['role', 'status', 'hospital_id']);

        $response = $this->actingAs($user)
            ->patchJson('/api/user/password', [
                'current_password' => 'current-password-123',
                'password' => 'updated-secure-password-789',
                'password_confirmation' => 'updated-secure-password-789',
                'user_id' => $otherUser->id,
                'role' => 'super_admin',
                'hospital_id' => null,
                'status' => 'suspended',
            ]);
        expect($response->status())->toBe(200, "Password change failed for {$role}: ".$response->getContent());
        $response->assertJsonMissingPath('password');

        $user->refresh();
        expect(Hash::check('updated-secure-password-789', $user->password))->toBeTrue()
            ->and($user->only(['role', 'status', 'hospital_id']))->toBe($original)
            ->and(Hash::check('other-current-password-123', $otherUser->fresh()->password))->toBeTrue();
    }
});

test('forgot password does not create reset tokens when the mailer logs message contents', function () {
    $user = createPasswordManagementUser();
    config(['mail.default' => 'log']);
    Notification::fake();

    $this->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertOk()
        ->assertJsonPath('message', 'If an account exists for that email, a password reset link will be sent.');

    Notification::assertNothingSent();
    $this->assertDatabaseCount('password_reset_tokens', 0);
});

test('password reset invalidates all database sessions for the affected user only', function () {
    config(['session.driver' => 'database']);
    $user = createPasswordManagementUser('hospital_admin');
    $otherUser = createPasswordManagementUser('hospital_staff');
    $token = requestPasswordResetToken($user);

    $this->withHeaders(['Origin' => 'http://127.0.0.1:5173'])
        ->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'current-password-123',
        ])
        ->assertOk();

    $loginSessionId = DB::table('sessions')
        ->where('user_id', $user->id)
        ->value('id');

    expect($loginSessionId)->not->toBeNull();
    createDatabaseSession('target-second-session', $user->id);
    createDatabaseSession('other-user-session', $otherUser->id);

    $this->postJson('/api/reset-password', [
        'token' => $token,
        'email' => $user->email,
        'password' => 'reset-session-password-789',
        'password_confirmation' => 'reset-session-password-789',
    ])->assertOk();

    $this->assertDatabaseMissing('sessions', ['id' => $loginSessionId]);
    $this->assertDatabaseMissing('sessions', ['id' => 'target-second-session']);
    $this->assertDatabaseHas('sessions', [
        'id' => 'other-user-session',
        'user_id' => $otherUser->id,
    ]);
    expect(Hash::check('reset-session-password-789', $user->fresh()->password))->toBeTrue();
});

test('password change invalidates other database sessions and keeps the current session usable', function () {
    config(['session.driver' => 'database']);
    $user = createPasswordManagementUser('hospital_admin');
    $otherUser = createPasswordManagementUser('hospital_staff');
    $cookieName = config('session.cookie');
    $origin = 'http://127.0.0.1:5173';

    $loginResponse = $this->withHeaders(['Origin' => $origin])
        ->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'current-password-123',
        ])
        ->assertOk();

    $currentSessionId = $loginResponse->getCookie($cookieName)?->getValue();
    expect($currentSessionId)->not->toBeNull();

    createDatabaseSession('other-target-session', $user->id);
    createDatabaseSession('other-user-session', $otherUser->id);

    Auth::forgetGuards();

    $this->withCredentials()
        ->withHeaders(['Origin' => $origin])
        ->withCookie($cookieName, $currentSessionId)
        ->patchJson('/api/user/password', [
            'current_password' => 'current-password-123',
            'password' => 'changed-session-password-789',
            'password_confirmation' => 'changed-session-password-789',
        ])
        ->assertOk();

    $this->assertDatabaseHas('sessions', [
        'id' => $currentSessionId,
        'user_id' => $user->id,
    ]);
    $this->assertDatabaseMissing('sessions', ['id' => 'other-target-session']);
    $this->assertDatabaseHas('sessions', [
        'id' => 'other-user-session',
        'user_id' => $otherUser->id,
    ]);

    $this->withCredentials()
        ->withHeaders(['Origin' => $origin])
        ->withCookie($cookieName, $currentSessionId)
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('user.id', $user->id);

    expect(Hash::check('changed-session-password-789', $user->fresh()->password))->toBeTrue();
});
