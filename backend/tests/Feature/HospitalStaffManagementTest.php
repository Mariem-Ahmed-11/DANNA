<?php

use App\Mail\HospitalStaffInvitationMail;
use App\Models\Hospital;
use App\Models\HospitalStaffInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

function createStaffManagementHospital(string $name): array
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Staff City',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();

    $admin = $hospital->users()->create([
        'name' => "{$name} Admin",
        'email' => strtolower(str_replace(' ', '-', $name)).'-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $admin->forceFill(['role' => 'hospital_admin', 'status' => 'active'])->save();

    return [$hospital, $admin];
}

function sendStaffInvitationAndReadToken(User $admin, string $email = 'new-staff@example.test'): string
{
    Mail::fake();
    test()->actingAs($admin)
        ->postJson('/api/hospital/staff/invitations', [
            'name' => 'Invited Staff',
            'email' => $email,
        ])
        ->assertCreated()
        ->assertJsonMissingPath('data.token');

    $token = null;
    Mail::assertSent(HospitalStaffInvitationMail::class, function (HospitalStaffInvitationMail $mail) use (&$token) {
        parse_str((string) parse_url($mail->invitationUrl, PHP_URL_FRAGMENT), $query);
        $token = $query['token'] ?? null;

        return filled($token);
    });

    return $token;
}

test('hospital admin can invite staff for their own approved hospital', function () {
    [$hospital, $admin] = createStaffManagementHospital('Invite Hospital');
    Mail::fake();

    $this->actingAs($admin)
        ->postJson('/api/hospital/staff/invitations', [
            'name' => 'New Staff',
            'email' => 'NEW-STAFF@example.test',
        ])
        ->assertCreated()
        ->assertJsonPath('data.email', 'new-staff@example.test')
        ->assertJsonMissingPath('data.token')
        ->assertJsonMissingPath('data.password');

    $invitation = HospitalStaffInvitation::query()->where('email', 'new-staff@example.test')->firstOrFail();
    expect($invitation->hospital_id)->toBe($hospital->id)
        ->and($invitation->invited_by)->toBe($admin->id)
        ->and($invitation->token_hash)->not->toBeNull()
        ->and(preg_match('/^[a-f0-9]{64}$/', $invitation->token_hash))->toBe(1)
        ->and(abs(($invitation->expires_at->timestamp - now()->timestamp) - 1800) < 2)->toBeTrue();

    $this->assertDatabaseMissing('users', ['email' => 'new-staff@example.test']);
    Mail::assertSent(HospitalStaffInvitationMail::class, function (HospitalStaffInvitationMail $mail) {
        return $mail->expiresInMinutes === 30
            && parse_url($mail->invitationUrl, PHP_URL_PATH) === '/accept-staff-invitation';
    });
});

test('hospital admin cannot invite a different role or choose a hospital', function () {
    [, $admin] = createStaffManagementHospital('Role Guard Hospital');
    Mail::fake();

    $this->actingAs($admin)
        ->postJson('/api/hospital/staff/invitations', [
            'name' => 'Privileged User',
            'email' => 'privileged@example.test',
            'role' => 'hospital_admin',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['role']);

    $this->postJson('/api/hospital/staff/invitations', [
        'name' => 'External Staff',
        'email' => 'external@example.test',
        'hospital_id' => 999,
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['hospital_id']);

    Mail::assertNothingSent();
});

test('hospital admins cannot manage staff belonging to another hospital', function () {
    [, $adminA] = createStaffManagementHospital('Staff Hospital A');
    [$hospitalB] = createStaffManagementHospital('Staff Hospital B');
    $staffB = $hospitalB->users()->create([
        'name' => 'Hospital B Staff',
        'email' => 'hospital-b-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staffB->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();

    $this->actingAs($adminA)
        ->postJson("/api/hospital/staff/{$staffB->id}/deactivate")
        ->assertNotFound();

    $this->getJson('/api/hospital/staff')
        ->assertOk()
        ->assertJsonMissing(['email' => 'hospital-b-staff@example.test']);

    expect($staffB->fresh()->status)->toBe('active');
});

test('hospital staff can view their directory but cannot manage staff or invitations', function () {
    [$hospital, $admin] = createStaffManagementHospital('Staff Access Hospital');
    $staff = $hospital->users()->create([
        'name' => 'Workspace Staff',
        'email' => 'workspace-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $superAdmin = User::query()->create([
        'name' => 'Existing Super Admin',
        'email' => 'existing-super@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    $this->actingAs($staff)
        ->getJson('/api/hospital/staff')
        ->assertOk()
        ->assertJsonPath('data.staff.0.email', 'workspace-staff@example.test')
        ->assertJsonPath('data.invitations', []);
    $this->postJson('/api/hospital/staff/invitations', [
        'name' => 'Other Staff',
        'email' => 'other-staff@example.test',
    ])->assertForbidden();
    $this->postJson("/api/hospital/staff/{$staff->id}/deactivate")->assertForbidden();
    $this->patchJson("/api/hospital/staff/{$staff->id}", [
        'role' => 'hospital_admin',
        'hospital_id' => $hospital->id,
    ])->assertNotFound();

    $this->actingAs($superAdmin)->getJson('/api/hospital/staff')->assertForbidden();
    $this->actingAs($admin)->getJson('/api/hospital/staff')->assertOk();
});

test('hospital admin cannot create a duplicate active invitation for the same email', function () {
    [, $admin] = createStaffManagementHospital('Duplicate Invite Hospital');
    Mail::fake();

    $payload = ['name' => 'Duplicate Invite', 'email' => 'duplicate@example.test'];
    $this->actingAs($admin)->postJson('/api/hospital/staff/invitations', $payload)->assertCreated();
    $this->postJson('/api/hospital/staff/invitations', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);

    Mail::assertSent(HospitalStaffInvitationMail::class, 1);
});

test('invitations are not created when the configured mail transport logs message contents', function () {
    [, $admin] = createStaffManagementHospital('Logging Mail Hospital');
    config(['mail.default' => 'log']);
    Mail::fake();

    $this->actingAs($admin)
        ->postJson('/api/hospital/staff/invitations', [
            'name' => 'No Mail Staff',
            'email' => 'no-mail@example.test',
        ])
        ->assertServiceUnavailable()
        ->assertJsonMissingPath('data.token');

    $this->assertDatabaseCount('hospital_staff_invitations', 0);
    Mail::assertNothingSent();
});

test('a committed invitation is preserved and no token is exposed when email delivery fails', function () {
    [, $admin] = createStaffManagementHospital('Mail Failure Hospital');
    Mail::shouldReceive('to')
        ->once()
        ->andThrow(new RuntimeException('SMTP transport unavailable.'));

    $response = $this->actingAs($admin)
        ->postJson('/api/hospital/staff/invitations', [
            'name' => 'Undelivered Staff',
            'email' => 'undelivered-staff@example.test',
        ])
        ->assertStatus(503)
        ->assertJsonMissingPath('data')
        ->assertJsonMissingPath('token');

    $invitation = HospitalStaffInvitation::query()
        ->where('email', 'undelivered-staff@example.test')
        ->firstOrFail();

    expect($invitation->token_hash)->not->toBeNull()
        ->and(preg_match('/^[a-f0-9]{64}$/', $invitation->token_hash))->toBe(1);
    $this->assertStringNotContainsString($invitation->token_hash, $response->getContent());
    $this->assertDatabaseMissing('users', ['email' => 'undelivered-staff@example.test']);
});

test('a valid invitation creates an active staff account for the inviting hospital', function () {
    [$hospital, $admin] = createStaffManagementHospital('Accept Invite Hospital');
    $token = sendStaffInvitationAndReadToken($admin);

    $this->postJson('/api/staff-invitations/accept', [
        'email' => 'new-staff@example.test',
        'token' => $token,
        'password' => 'secure-new-password-123',
        'password_confirmation' => 'secure-new-password-123',
        'role' => 'super_admin',
        'hospital_id' => 999,
    ])
        ->assertCreated()
        ->assertJsonPath('user.role', 'hospital_staff')
        ->assertJsonPath('user.status', 'active')
        ->assertJsonPath('user.hospital_id', $hospital->id)
        ->assertJsonMissingPath('user.password');

    $user = User::query()->where('email', 'new-staff@example.test')->firstOrFail();
    expect($user->email_verified_at)->not->toBeNull()
        ->and($user->hospital_id)->toBe($hospital->id)
        ->and($user->role)->toBe('hospital_staff')
        ->and($user->status)->toBe('active');

    $this->actingAs($admin)
        ->getJson('/api/hospital/staff')
        ->assertOk()
        ->assertJsonPath('data.staff.0.email', 'new-staff@example.test')
        ->assertJsonPath('data.invitations.0.status', 'accepted');
});

test('expired invitations are rejected and do not create an account', function () {
    [$hospital, $admin] = createStaffManagementHospital('Expired Invite Hospital');
    $token = sendStaffInvitationAndReadToken($admin, 'expired-staff@example.test');
    HospitalStaffInvitation::query()->where('email', 'expired-staff@example.test')
        ->update(['expires_at' => now()->subMinute()]);

    $this->postJson('/api/staff-invitations/accept', [
        'email' => 'expired-staff@example.test',
        'token' => $token,
        'password' => 'secure-new-password-123',
        'password_confirmation' => 'secure-new-password-123',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['invitation']);

    $this->assertDatabaseMissing('users', ['email' => 'expired-staff@example.test']);
    expect($hospital->users()->where('role', 'hospital_staff')->exists())->toBeFalse();
});

test('accepted invitation tokens cannot be reused', function () {
    [, $admin] = createStaffManagementHospital('Single Use Invite Hospital');
    $token = sendStaffInvitationAndReadToken($admin, 'single-use@example.test');
    $payload = [
        'email' => 'single-use@example.test',
        'token' => $token,
        'password' => 'secure-new-password-123',
        'password_confirmation' => 'secure-new-password-123',
    ];

    $this->postJson('/api/staff-invitations/accept', $payload)->assertCreated();
    $this->postJson('/api/staff-invitations/accept', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['invitation']);

    $this->assertDatabaseCount('users', 2);
});

test('deactivated staff lose access and regain authentication after reactivation', function () {
    [$hospital, $admin] = createStaffManagementHospital('Activation Hospital');
    $staff = $hospital->users()->create([
        'name' => 'Activation Staff',
        'email' => 'activation-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();

    $this->actingAs($admin)
        ->postJson("/api/hospital/staff/{$staff->id}/deactivate")
        ->assertOk();

    $this->actingAs($staff)
        ->getJson('/api/hospital/workspace')
        ->assertForbidden();

    $this->withHeaders(['Origin' => 'http://127.0.0.1:5173'])->postJson('/api/login', [
        'email' => 'activation-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ])->assertForbidden();

    $this->actingAs($admin)
        ->postJson("/api/hospital/staff/{$staff->id}/reactivate")
        ->assertOk();

    $this->withHeaders(['Origin' => 'http://127.0.0.1:5173'])->postJson('/api/login', [
        'email' => 'activation-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ])
        ->assertOk()
        ->assertJsonPath('user.role', 'hospital_staff');
});
