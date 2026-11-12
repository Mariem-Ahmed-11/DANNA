<?php

use App\Models\Hospital;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

function hospitalWithAccount(string $name, string $status = 'approved'): array
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Springfield',
        'phone' => '555-0100',
    ]);
    $hospital->forceFill(['status' => $status])->save();
    $user = $hospital->users()->create([
        'name' => "{$name} Admin",
        'email' => strtolower(str_replace(' ', '-', $name)).'@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill([
        'role' => 'hospital_admin',
        'status' => $status === 'approved' ? 'active' : 'pending',
    ])->save();

    return [$hospital, $user];
}

function validPngUpload(string $name): UploadedFile
{
    $png = base64_decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
        true
    );

    return UploadedFile::fake()->createWithContent($name, $png);
}

test('hospital management endpoints require authentication', function () {
    $this->getJson('/api/hospitals')->assertUnauthorized();
    $this->patchJson('/api/hospitals/1', ['name' => 'Protected'])->assertUnauthorized();
    $this->getJson('/api/admin/hospital-requests')->assertUnauthorized();
});

test('hospital representative can submit a pending registration', function () {
    $this->postJson('/api/hospitals', [
        'name' => 'Community Hospital',
        'city' => 'Rivertown',
        'phone' => '555-0101',
        'contact_name' => 'Hospital Representative',
        'email' => 'representative@example.test',
        'password' => 'strong-hospital-password',
        'password_confirmation' => 'strong-hospital-password',
        'role' => 'super_admin',
        'status' => 'approved',
        'hospital_id' => 999,
    ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Community Hospital')
        ->assertJsonPath('data.status', 'pending_review')
        ->assertJsonMissingPath('data.logo_path');

    $hospital = Hospital::query()->with('users')->sole();
    expect($hospital->status)->toBe('pending_review')
        ->and($hospital->users)->toHaveCount(1)
        ->and($hospital->users->first()->role)->toBe('hospital_admin')
        ->and($hospital->users->first()->status)->toBe('pending')
        ->and($hospital->users->first()->hospital_id)->toBe($hospital->id);
    $this->assertDatabaseHas('hospital_lifecycle_events', [
        'hospital_id' => $hospital->id,
        'action' => 'registration',
        'previous_status' => null,
        'new_status' => 'pending_review',
    ]);
});

test('hospital registration validates data and does not create partial records', function () {
    $this->withHeaders(['Origin' => 'http://127.0.0.1:5173'])
        ->postJson('/api/hospitals', [
            'name' => str_repeat('H', 256),
            'city' => '',
            'contact_name' => '',
            'email' => 'invalid',
            'password' => 'short',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name', 'city', 'contact_name', 'email', 'password']);

    $this->assertDatabaseCount('hospitals', 0);
    $this->assertDatabaseCount('users', 0);
});

test('hospital registration accepts profile information and an optional validated logo', function () {
    Storage::fake('public');

    $response = $this->postJson('/api/hospitals', [
        'name' => 'Profile Hospital',
        'city' => 'Rivertown',
        'governorate' => 'Central Governorate',
        'address' => '15 Care Avenue',
        'phone' => '555-0155',
        'contact_email' => 'contact@profile-hospital.test',
        'short_description' => 'A hospital profile summary.',
        'overview' => 'Additional facility information.',
        'website_url' => 'https://profile-hospital.test',
        'working_hours' => 'Daily, 08:00–20:00',
        'establishment_year' => 1995,
        'location_url' => 'https://maps.google.com/?q=profile-hospital',
        'specialties' => ['Neonatal care'],
        'services' => ['Neonatal intensive care'],
        'logo' => validPngUpload('hospital-logo.png'),
        'contact_name' => 'Private Administrator',
        'email' => 'private-admin@profile-hospital.test',
        'password' => 'strong-hospital-password',
        'password_confirmation' => 'strong-hospital-password',
    ])->assertCreated()
        ->assertJsonMissingPath('data.contact_email')
        ->assertJsonMissingPath('data.users');

    $hospital = Hospital::query()->sole();
    expect($hospital->governorate)->toBe('Central Governorate')
        ->and($hospital->address)->toBe('15 Care Avenue')
        ->and($hospital->specialties)->toBe(['Neonatal care'])
        ->and($hospital->services)->toBe(['Neonatal intensive care'])
        ->and($hospital->status)->toBe('pending_review');
    Storage::disk('public')->assertExists($hospital->logo_path);
    $this->assertDatabaseHas('users', [
        'email' => 'private-admin@profile-hospital.test',
        'role' => 'hospital_admin',
        'status' => 'pending',
    ]);
});

test('hospital registration rejects unsafe image formats', function () {
    Storage::fake('public');

    $this->postJson('/api/hospitals', [
        'name' => 'Invalid Logo Hospital',
        'city' => 'Rivertown',
        'contact_name' => 'Hospital Representative',
        'email' => 'invalid-logo@example.test',
        'password' => 'strong-hospital-password',
        'password_confirmation' => 'strong-hospital-password',
        'logo' => UploadedFile::fake()->create('script.svg', 10, 'image/svg+xml'),
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['logo']);

    $this->assertDatabaseCount('hospitals', 0);
    Storage::disk('public')->assertDirectoryEmpty('hospital-logos');
});

test('hospital admins can read and update only their profile without changing private account fields', function () {
    [$hospital, $admin] = hospitalWithAccount('Profile Ownership Hospital');
    [$otherHospital] = hospitalWithAccount('Other Profile Hospital');

    $this->actingAs($admin)
        ->getJson('/api/hospital/profile')
        ->assertOk()
        ->assertJsonPath('data.id', $hospital->id)
        ->assertJsonPath('data.name', $hospital->name)
        ->assertJsonPath('data.logo_url', null)
        ->assertJsonMissingPath('data.logo_path')
        ->assertJsonMissingPath('data.status')
        ->assertJsonMissingPath('data.users')
        ->assertJsonMissingPath('data.email');

    $this->actingAs($admin)
        ->patchJson('/api/hospital/profile', [
            'name' => 'Updated Profile Hospital',
            'contact_email' => 'public-contact@profile.test',
            'governorate' => 'North',
            'address' => '28 Hospital Road',
            'short_description' => 'A concise hospital description.',
            'overview' => 'A detailed profile description.',
            'website_url' => 'https://profile.test',
            'working_hours' => '24 hours',
            'establishment_year' => 2001,
            'location_url' => 'https://maps.google.com/?q=profile',
            'specialties' => ['Neonatal care', 'Pediatrics'],
            'services' => ['Neonatal intensive care'],
            'hospital_id' => $otherHospital->id,
            'status' => 'approved',
            'role' => 'super_admin',
            'email' => 'changed-admin@example.test',
        ])
        ->assertOk()
        ->assertJsonPath('data.name', 'Updated Profile Hospital')
        ->assertJsonPath('data.contact_email', 'public-contact@profile.test')
        ->assertJsonPath('data.specialties.0', 'Neonatal care')
        ->assertJsonMissingPath('data.status')
        ->assertJsonMissingPath('data.users');

    $this->assertDatabaseHas('hospitals', [
        'id' => $hospital->id,
        'status' => 'approved',
        'name' => 'Updated Profile Hospital',
    ]);
    $this->assertDatabaseHas('users', [
        'id' => $admin->id,
        'hospital_id' => $hospital->id,
        'role' => 'hospital_admin',
        'email' => $admin->email,
    ]);
});

test('profile updates validate optional fields and preserve prior values on invalid input', function () {
    [$hospital, $admin] = hospitalWithAccount('Validated Profile Hospital');

    $this->actingAs($admin)
        ->patchJson('/api/hospital/profile', [
            'contact_email' => 'not-an-email',
            'website_url' => 'not-a-url',
            'establishment_year' => 3000,
            'specialties' => array_fill(0, 21, 'Specialty'),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['contact_email', 'website_url', 'establishment_year', 'specialties']);

    expect($hospital->fresh()->contact_email)->toBeNull();
});

test('hospital admins can upload replace and remove their public profile image', function () {
    Storage::fake('public');
    [$hospital, $admin] = hospitalWithAccount('Logo Profile Hospital');

    $first = $this->actingAs($admin)
        ->post('/api/hospital/profile', [
            'logo' => validPngUpload('first-logo.png'),
            '_method' => 'PATCH',
        ], ['Accept' => 'application/json'])
        ->assertOk()
        ->assertJsonMissingPath('data.logo_path');
    $firstPath = $hospital->fresh()->logo_path;
    Storage::disk('public')->assertExists($firstPath);
    expect($first->json('data.logo_url'))->toContain('/storage/hospital-logos/');

    $this->actingAs($admin)
        ->post('/api/hospital/profile', [
            'logo' => validPngUpload('replacement-logo.png'),
            '_method' => 'PATCH',
        ], ['Accept' => 'application/json'])
        ->assertOk();
    $replacementPath = $hospital->fresh()->logo_path;
    expect($replacementPath)->not->toBe($firstPath);
    Storage::disk('public')->assertExists($replacementPath);
    Storage::disk('public')->assertMissing($firstPath);

    $this->actingAs($admin)
        ->patchJson('/api/hospital/profile', ['remove_logo' => true])
        ->assertOk()
        ->assertJsonPath('data.logo_url', null);
    expect($hospital->fresh()->logo_path)->toBeNull();
    Storage::disk('public')->assertMissing($replacementPath);
});

test('authenticated hospital accounts receive their public logo URL without its storage path', function () {
    Storage::fake('public');
    [$hospital, $admin] = hospitalWithAccount('Hospital Avatar');
    $logoPath = 'hospital-logos/hospital-avatar.png';
    Storage::disk('public')->put($logoPath, 'image-bytes');
    $hospital->forceFill(['logo_path' => $logoPath])->save();

    $this->actingAs($admin)
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('user.hospital.id', $hospital->id)
        ->assertJsonPath('user.hospital.logo_url', Storage::disk('public')->url($logoPath))
        ->assertJsonMissingPath('user.hospital.logo_path');
});

test('hospital staff can view their hospital profile but cannot update it', function () {
    [$hospitalA, $adminA] = hospitalWithAccount('Profile Hospital A');
    [$hospitalB] = hospitalWithAccount('Profile Hospital B');
    $staff = $hospitalA->users()->create([
        'name' => 'Profile Staff',
        'email' => 'profile-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $superAdmin = User::factory()->create();

    $this->getJson('/api/hospital/profile')->assertUnauthorized();
    $this->patchJson('/api/hospital/profile', ['name' => 'Unauthorized'])->assertUnauthorized();

    $this->actingAs($staff)
        ->getJson('/api/hospital/profile')
        ->assertOk()
        ->assertJsonPath('data.id', $hospitalA->id)
        ->assertJsonPath('data.name', $hospitalA->name);
    $this->actingAs($staff)
        ->patchJson('/api/hospital/profile', ['name' => 'Unauthorized'])
        ->assertForbidden();

    $this->actingAs($superAdmin)->getJson('/api/hospital/profile')->assertForbidden();
    $this->actingAs($superAdmin)
        ->patchJson('/api/hospital/profile', ['name' => 'Unauthorized'])
        ->assertForbidden();

    $this->actingAs($adminA)
        ->getJson("/api/hospitals/{$hospitalB->id}")
        ->assertNotFound();

    $this->assertDatabaseHas('hospitals', [
        'id' => $hospitalB->id,
        'name' => 'Profile Hospital B',
    ]);
});

test('only super admins can list review requests and approve registrations', function () {
    [$hospital] = hospitalWithAccount('Pending Hospital', 'pending_review');
    $superAdmin = User::factory()->create();

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/hospital-requests')
        ->assertOk()
        ->assertJsonPath('data.0.id', $hospital->id);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/approve")
        ->assertOk()
        ->assertJsonPath('data.status', 'approved');
    $this->assertDatabaseHas('hospital_lifecycle_events', [
        'hospital_id' => $hospital->id,
        'action' => 'approval',
        'previous_status' => 'pending_review',
        'new_status' => 'approved',
        'actor_id' => $superAdmin->id,
    ]);

    $this->assertDatabaseHas('users', [
        'hospital_id' => $hospital->id,
        'role' => 'hospital_admin',
        'status' => 'active',
    ]);
});

test('super admins can reject registrations and rejected accounts remain blocked', function () {
    [$hospital] = hospitalWithAccount('Rejected Hospital', 'pending_review');
    $superAdmin = User::factory()->create();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/reject", [
            'reason' => 'Please provide the missing hospital registration documents.',
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'rejected');

    $user = $hospital->users()->first();
    $user->refresh();
    expect($user->status)->toBe('rejected');
    $this->assertDatabaseHas('hospital_lifecycle_events', [
        'hospital_id' => $hospital->id,
        'action' => 'rejection',
        'reason' => 'Please provide the missing hospital registration documents.',
        'actor_id' => $superAdmin->id,
    ]);

    $this->withHeaders(['Origin' => 'http://127.0.0.1:5173'])
        ->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-horse-battery-staple',
        ])->assertOk()
        ->assertJsonPath('user.status', 'rejected');

    $this->actingAs($user)
        ->getJson('/api/hospital/lifecycle-status')
        ->assertOk()
        ->assertJsonPath('data.status', 'rejected')
        ->assertJsonPath('data.decision.reason', 'Please provide the missing hospital registration documents.');

    $this->actingAs($user)
        ->getJson('/api/hospitals')
        ->assertForbidden();
});

test('pending and suspended hospital accounts cannot log in', function () {
    foreach ([
        ['Pending Hospital', 'pending_review', 'pending'],
        ['Suspended Hospital', 'suspended', 'suspended'],
    ] as [$name, $hospitalStatus, $accountStatus]) {
        $hospital = Hospital::query()->create([
            'name' => $name,
            'city' => 'Springfield',
        ]);
        $hospital->forceFill(['status' => $hospitalStatus])->save();
        $user = $hospital->users()->create([
            'name' => "{$name} Admin",
            'email' => strtolower(str_replace(' ', '-', $name)).'@example.test',
            'password' => 'correct-horse-battery-staple',
        ]);
        $user->forceFill([
            'role' => 'hospital_admin',
            'status' => $accountStatus,
        ])->save();

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-horse-battery-staple',
        ])->assertForbidden();

        $this->actingAs($user)
            ->getJson('/api/hospitals')
            ->assertForbidden();
    }
});

test('non-admin hospital accounts cannot manage review requests', function () {
    [$hospital, $hospitalUser] = hospitalWithAccount('Active Hospital');

    $this->actingAs($hospitalUser)
        ->getJson('/api/admin/hospital-requests')
        ->assertForbidden();

    $this->actingAs($hospitalUser)
        ->postJson("/api/admin/hospitals/{$hospital->id}/suspend")
        ->assertForbidden();
});

test('only super admins and the owning hospital admin can update hospital details', function () {
    [$hospitalA, $hospitalUserA] = hospitalWithAccount('Hospital A');
    [$hospitalB] = hospitalWithAccount('Hospital B');
    $staffA = $hospitalA->users()->create([
        'name' => 'Hospital A Staff',
        'email' => 'hospital-a-details-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staffA->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();

    $this->actingAs($hospitalUserA)
        ->getJson('/api/hospitals')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $hospitalA->id);

    $this->actingAs($hospitalUserA)
        ->getJson("/api/hospitals/{$hospitalB->id}")
        ->assertNotFound();

    $this->actingAs($hospitalUserA)
        ->patchJson("/api/hospitals/{$hospitalB->id}", ['name' => 'Hijacked'])
        ->assertNotFound();

    $this->assertDatabaseHas('hospitals', [
        'id' => $hospitalB->id,
        'name' => 'Hospital B',
    ]);

    $this->actingAs($hospitalUserA)
        ->patchJson("/api/hospitals/{$hospitalA->id}", ['name' => 'Hospital A Updated'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Hospital A Updated');

    $this->actingAs($staffA)
        ->getJson('/api/hospitals')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $hospitalA->id);

    $this->actingAs($staffA)
        ->patchJson("/api/hospitals/{$hospitalA->id}", ['name' => 'Staff Updated'])
        ->assertNotFound();

    $this->assertDatabaseHas('hospitals', [
        'id' => $hospitalA->id,
        'name' => 'Hospital A Updated',
    ]);
});

test('hospital responses omit unrelated user fields while registration requests expose only contact details', function () {
    [$hospital, $hospitalAdmin] = hospitalWithAccount('Response Privacy Hospital');
    $superAdmin = User::factory()->create();

    $this->actingAs($hospitalAdmin)
        ->getJson('/api/hospitals')
        ->assertOk()
        ->assertJsonPath('data.0.id', $hospital->id)
        ->assertJsonMissingPath('data.0.users')
        ->assertJsonMissingPath('data.0.email');

    $this->actingAs($superAdmin)
        ->getJson("/api/hospitals/{$hospital->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $hospital->id)
        ->assertJsonMissingPath('data.users');

    $pendingHospital = Hospital::query()->create([
        'name' => 'Pending Response Privacy Hospital',
        'city' => 'Springfield',
    ]);
    $pendingHospital->forceFill(['status' => 'pending_review'])->save();
    $pendingContact = $pendingHospital->users()->create([
        'name' => 'Pending Contact',
        'email' => 'pending-contact@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $pendingContact->forceFill(['role' => 'hospital_admin', 'status' => 'pending'])->save();

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/hospital-requests')
        ->assertOk()
        ->assertJsonPath('data.0.users.0.name', 'Pending Contact')
        ->assertJsonPath('data.0.users.0.email', 'pending-contact@example.test')
        ->assertJsonMissingPath('data.0.users.0.role')
        ->assertJsonMissingPath('data.0.users.0.status')
        ->assertJsonMissingPath('data.0.users.0.password');
});

test('suspending an approved hospital disables its active users', function () {
    [$hospital, $hospitalUser] = hospitalWithAccount('Suspended Hospital');
    $superAdmin = User::factory()->create();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/suspend", [
            'reason' => 'The hospital account requires an urgent compliance review.',
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'suspended');

    $this->assertDatabaseHas('users', [
        'id' => $hospitalUser->id,
        'status' => 'suspended',
    ]);

    $this->actingAs($hospitalUser)
        ->getJson('/api/hospitals')
        ->assertForbidden();
});
