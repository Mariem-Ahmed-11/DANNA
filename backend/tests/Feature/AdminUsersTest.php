<?php

use App\Models\Hospital;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('admin users endpoint requires an active super admin', function () {
    $hospital = Hospital::query()->create([
        'name' => 'Users Access Hospital',
        'city' => 'Cairo',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();
    $hospitalAdmin = $hospital->users()->create([
        'name' => 'Hospital Administrator',
        'email' => 'users-hospital-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $hospitalAdmin->forceFill(['role' => 'hospital_admin', 'status' => 'active'])->save();

    $this->getJson('/api/admin/users')->assertUnauthorized();

    $this->actingAs($hospitalAdmin)
        ->getJson('/api/admin/users')
        ->assertForbidden();
});

test('super admin can list hospital users with their hospital status', function () {
    $hospital = Hospital::query()->create([
        'name' => 'Users Directory Hospital',
        'city' => 'Cairo',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();
    $user = $hospital->users()->create([
        'name' => 'Directory Staff Member',
        'email' => 'directory-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill(['role' => 'hospital_staff', 'status' => 'suspended'])->save();
    $superAdmin = User::query()->create([
        'name' => 'Directory Super Admin',
        'email' => 'directory-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/users')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $user->id)
        ->assertJsonPath('data.0.status', 'suspended')
        ->assertJsonPath('data.0.hospital.name', 'Users Directory Hospital')
        ->assertJsonPath('data.0.hospital.status', 'approved');
});

test('super admin can view all hospital accounts and their statuses', function () {
    $hospital = Hospital::query()->create([
        'name' => 'Hospital Accounts Directory',
        'city' => 'Cairo',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();
    $active = $hospital->users()->create([
        'name' => 'Active Hospital Staff',
        'email' => 'active-hospital-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $active->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $suspended = $hospital->users()->create([
        'name' => 'Suspended Hospital Staff',
        'email' => 'suspended-hospital-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $suspended->forceFill(['role' => 'hospital_staff', 'status' => 'suspended'])->save();
    $superAdmin = User::query()->create([
        'name' => 'Hospital Accounts Admin',
        'email' => 'hospital-accounts-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    $this->actingAs($superAdmin)
        ->getJson("/api/admin/hospitals/{$hospital->id}/accounts")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonFragment(['id' => $active->id, 'status' => 'active'])
        ->assertJsonFragment(['id' => $suspended->id, 'status' => 'suspended']);
});
