<?php

use App\Models\Hospital;
use App\Models\HospitalLifecycleEvent;
use App\Models\User;
use App\Models\UserAccountStatusEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('audit log endpoint is restricted to active super admins', function () {
    $hospital = Hospital::query()->create([
        'name' => 'Audit Access Hospital',
        'city' => 'Cairo',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();
    $hospitalAdmin = $hospital->users()->create([
        'name' => 'Audit Hospital Admin',
        'email' => 'audit-hospital-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $hospitalAdmin->forceFill(['role' => 'hospital_admin', 'status' => 'active'])->save();

    $this->getJson('/api/admin/audit-logs')->assertUnauthorized();
    $this->actingAs($hospitalAdmin)->getJson('/api/admin/audit-logs')->assertForbidden();
});

test('super admin can search and filter real hospital and account audit events', function () {
    $hospital = Hospital::query()->create([
        'name' => 'Audit Events Hospital',
        'city' => 'Cairo',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();
    $staff = $hospital->users()->create([
        'name' => 'Audit Events Staff',
        'email' => 'audit-events-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'suspended'])->save();
    $superAdmin = User::query()->create([
        'name' => 'Audit Events Admin',
        'email' => 'audit-events-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    HospitalLifecycleEvent::query()->create([
        'hospital_id' => $hospital->id,
        'previous_status' => 'pending_review',
        'new_status' => 'approved',
        'action' => 'approval',
        'reason' => 'Registration verified',
        'actor_id' => $superAdmin->id,
        'created_at' => now()->subMinute(),
    ]);
    UserAccountStatusEvent::query()->create([
        'user_id' => $staff->id,
        'hospital_id' => $hospital->id,
        'actor_id' => $superAdmin->id,
        'previous_status' => 'active',
        'new_status' => 'suspended',
        'action' => 'manual_deactivation',
        'reason' => 'Access no longer required',
        'created_at' => now(),
    ]);

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/audit-logs?type=account&search=Audit%20Events')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('current_page', 1)
        ->assertJsonPath('last_page', 1)
        ->assertJsonPath('total', 1)
        ->assertJsonPath('data.0.event_type', 'account')
        ->assertJsonPath('data.0.subject_name', 'Audit Events Staff')
        ->assertJsonPath('data.0.actor_name', 'Audit Events Admin')
        ->assertJsonPath('data.0.hospital_name', 'Audit Events Hospital')
        ->assertJsonPath('data.0.reason', 'Access no longer required');
});
