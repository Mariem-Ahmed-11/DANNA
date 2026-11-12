<?php

use App\Models\DataReviewSubmission;
use App\Models\Hospital;
use App\Models\User;
use App\Models\UserAccountStatusEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function lifecycleHospital(string $name, string $status = 'approved'): array
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Springfield',
    ]);
    $hospital->forceFill(['status' => $status])->save();
    $admin = $hospital->users()->create([
        'name' => "{$name} Admin",
        'email' => strtolower(str_replace(' ', '-', $name)).'@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $admin->forceFill([
        'role' => 'hospital_admin',
        'status' => match ($status) {
            'approved' => 'active',
            'rejected' => 'rejected',
            'suspended' => 'suspended',
            default => 'pending',
        },
    ])->save();

    return [$hospital, $admin];
}

function lifecycleSuperAdmin(): User
{
    return User::factory()->create();
}

test('rejection and suspension require reasons and reject invalid repeated transitions', function () {
    [$pendingHospital] = lifecycleHospital('Reason Required Pending Hospital', 'pending_review');
    [$approvedHospital] = lifecycleHospital('Reason Required Approved Hospital');
    $superAdmin = lifecycleSuperAdmin();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$pendingHospital->id}/reject")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    $this->postJson("/api/admin/hospitals/{$pendingHospital->id}/reject", [
        'reason' => 'short',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    $this->postJson("/api/admin/hospitals/{$pendingHospital->id}/reject", [
        'reason' => 'Please provide the missing registration records.',
    ])->assertOk();

    $this->postJson("/api/admin/hospitals/{$pendingHospital->id}/reject", [
        'reason' => 'A repeated decision must not be recorded.',
    ])->assertUnprocessable();

    $this->postJson("/api/admin/hospitals/{$approvedHospital->id}/suspend")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    $this->postJson("/api/admin/hospitals/{$approvedHospital->id}/suspend", [
        'reason' => 'A compliance review is required before further operation.',
    ])->assertOk();

    $events = $approvedHospital->lifecycleEvents()->get();
    expect($events)->toHaveCount(1)
        ->and($events->first()->action)->toBe('suspension');
});

test('rejected administrators can correct and resubmit only their own hospital application', function () {
    [$hospital, $admin] = lifecycleHospital('Rejected Correction Hospital', 'pending_review');
    [$otherHospital, $otherAdmin] = lifecycleHospital('Other Rejected Hospital', 'pending_review');
    $superAdmin = lifecycleSuperAdmin();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/reject", [
            'reason' => 'Please update the hospital registration information.',
        ])->assertOk();

    $admin->refresh();
    $this->actingAs($admin)
        ->getJson('/api/hospital/lifecycle-status')
        ->assertOk()
        ->assertJsonPath('data.status', 'rejected')
        ->assertJsonPath('data.decision.reason', 'Please update the hospital registration information.')
        ->assertJsonPath('data.can_resubmit', true);

    $this->patchJson('/api/hospital/rejected-registration/profile', [
        'name' => 'Corrected Hospital Name',
        'city' => 'New Springfield',
        'hospital_id' => $otherHospital->id,
        'status' => 'approved',
    ])->assertOk()
        ->assertJsonPath('data.name', 'Corrected Hospital Name')
        ->assertJsonMissingPath('data.status');

    $this->actingAs($otherAdmin)
        ->patchJson('/api/hospital/rejected-registration/profile', ['name' => 'Unauthorized'])
        ->assertForbidden();

    $this->actingAs($admin)
        ->postJson('/api/hospital/rejected-registration/resubmit')
        ->assertOk()
        ->assertJsonPath('data.status', 'pending_review');

    $this->assertDatabaseHas('hospitals', [
        'id' => $hospital->id,
        'name' => 'Corrected Hospital Name',
        'status' => 'pending_review',
    ]);
    $this->assertDatabaseHas('users', [
        'id' => $admin->id,
        'hospital_id' => $hospital->id,
        'role' => 'hospital_admin',
        'status' => 'pending',
    ]);
    $this->assertDatabaseHas('hospital_lifecycle_events', [
        'hospital_id' => $hospital->id,
        'action' => 'resubmission',
        'previous_status' => 'rejected',
        'new_status' => 'pending_review',
        'actor_id' => $admin->id,
    ]);

    $admin->refresh();
    $this->getJson('/api/hospital/lifecycle-status')->assertForbidden();
    $this->getJson('/api/hospital/workspace')->assertForbidden();
});

test('suspension and reactivation preserve operational and review records and restore only previously active users', function () {
    [$hospital, $admin] = lifecycleHospital('Suspension History Hospital');
    $activeStaff = $hospital->users()->create([
        'name' => 'Active Staff',
        'email' => 'active-staff-lifecycle@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $activeStaff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $previouslySuspendedStaff = $hospital->users()->create([
        'name' => 'Previously Suspended Staff',
        'email' => 'previously-suspended-lifecycle@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $previouslySuspendedStaff->forceFill(['role' => 'hospital_staff', 'status' => 'suspended'])->save();
    $pendingStaff = $hospital->users()->create([
        'name' => 'Pending Staff',
        'email' => 'pending-lifecycle@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $pendingStaff->forceFill(['role' => 'hospital_staff', 'status' => 'pending'])->save();

    $unit = $hospital->incubatorUnits()->create([
        'name' => 'Neonatal Unit',
        'total_capacity' => 8,
        'available_capacity' => 3,
    ]);
    $submission = DataReviewSubmission::query()->create([
        'hospital_id' => $hospital->id,
        'target_type' => 'hospital_profile',
        'target_id' => $hospital->id,
        'status' => 'pending_review',
        'snapshot' => ['name' => $hospital->name],
        'snapshot_hash' => hash('sha256', $hospital->name),
        'submitted_by' => $admin->id,
        'submitted_at' => now(),
    ]);
    $superAdmin = lifecycleSuperAdmin();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/suspend", [
            'reason' => 'A compliance issue requires temporary suspension.',
        ])->assertOk()
        ->assertJsonPath('data.status', 'suspended');

    $this->assertDatabaseHas('users', ['id' => $admin->id, 'status' => 'suspended']);
    $this->assertDatabaseHas('users', ['id' => $activeStaff->id, 'status' => 'suspended']);
    $this->assertDatabaseHas('users', ['id' => $previouslySuspendedStaff->id, 'status' => 'suspended']);
    $this->assertDatabaseHas('users', ['id' => $pendingStaff->id, 'status' => 'pending']);

    $this->getJson("/api/admin/hospitals/{$hospital->id}/lifecycle-history")
        ->assertOk()
        ->assertJsonPath('data.0.actor.id', $superAdmin->id)
        ->assertJsonPath('data.0.reason', 'A compliance issue requires temporary suspension.')
        ->assertJsonMissingPath('data.0.metadata');

    $this->actingAs($admin)
        ->getJson("/api/admin/hospitals/{$hospital->id}/lifecycle-history")
        ->assertForbidden();

    $admin->refresh();
    $this->actingAs($admin)
        ->getJson('/api/hospital/lifecycle-status')
        ->assertOk()
        ->assertJsonPath('data.status', 'suspended')
        ->assertJsonPath('data.decision.reason', 'A compliance issue requires temporary suspension.');

    $this->getJson('/api/hospital/workspace')->assertForbidden();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/reactivate")
        ->assertOk()
        ->assertJsonPath('data.status', 'approved');

    $this->assertDatabaseHas('users', ['id' => $admin->id, 'status' => 'active']);
    $this->assertDatabaseHas('users', ['id' => $activeStaff->id, 'status' => 'active']);
    $this->assertDatabaseHas('users', ['id' => $previouslySuspendedStaff->id, 'status' => 'suspended']);
    $this->assertDatabaseHas('users', ['id' => $pendingStaff->id, 'status' => 'pending']);
    $admin->refresh();
    $this->actingAs($admin)
        ->getJson('/api/hospital/workspace')
        ->assertOk();
    $this->assertDatabaseHas('incubator_units', ['id' => $unit->id, 'hospital_id' => $hospital->id]);
    $this->assertDatabaseHas('data_review_submissions', [
        'id' => $submission->id,
        'hospital_id' => $hospital->id,
        'status' => 'pending_review',
    ]);
    $this->assertDatabaseHas('hospital_lifecycle_events', [
        'hospital_id' => $hospital->id,
        'action' => 'reactivation',
        'previous_status' => 'suspended',
        'new_status' => 'approved',
        'actor_id' => $superAdmin->id,
    ]);
});

test('hospital accounts cannot make lifecycle decisions and only super admins can view decision history', function () {
    [$hospital, $admin] = lifecycleHospital('Lifecycle Authorization Hospital');
    $staff = $hospital->users()->create([
        'name' => 'Lifecycle Staff',
        'email' => 'lifecycle-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $otherSuperAdmin = lifecycleSuperAdmin();

    $this->actingAs($admin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/suspend", [
            'reason' => 'This account should not be able to suspend.',
        ])->assertForbidden();

    $this->actingAs($staff)
        ->getJson("/api/admin/hospitals/{$hospital->id}/lifecycle-history")
        ->assertForbidden();

    $this->actingAs($otherSuperAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/approve")
        ->assertUnprocessable();
});

test('super admins can manually activate suspended hospital users with an append-only audit event', function () {
    [$hospital, $admin] = lifecycleHospital('Manual Activation Hospital');
    $admin->forceFill(['status' => 'suspended'])->save();

    $suspendedStaff = $hospital->users()->create([
        'name' => 'Suspended Staff',
        'email' => 'suspended-manual-activation@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $suspendedStaff->forceFill(['role' => 'hospital_staff', 'status' => 'suspended'])->save();

    $activeStaff = $hospital->users()->create([
        'name' => 'Active Staff',
        'email' => 'active-manual-activation@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $activeStaff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();

    $superAdmin = lifecycleSuperAdmin();

    $this->actingAs($superAdmin)
        ->getJson("/api/admin/hospitals/{$hospital->id}/users")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonMissing(['email' => 'active-manual-activation@example.test']);

    $this->postJson("/api/admin/hospitals/{$hospital->id}/users/{$admin->id}/activate", [
        'reason' => 'Manual identity and employment review completed.',
    ])
        ->assertOk()
        ->assertJsonPath('data.id', $admin->id)
        ->assertJsonPath('data.status', 'active');

    $this->assertDatabaseHas('users', [
        'id' => $admin->id,
        'status' => 'active',
    ]);
    $this->assertDatabaseHas('user_account_status_events', [
        'user_id' => $admin->id,
        'hospital_id' => $hospital->id,
        'actor_id' => $superAdmin->id,
        'previous_status' => 'suspended',
        'new_status' => 'active',
        'action' => 'manual_activation',
        'reason' => 'Manual identity and employment review completed.',
    ]);

    $this->getJson("/api/admin/hospitals/{$hospital->id}/user-status-history")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.user.id', $admin->id)
        ->assertJsonPath('data.0.actor.id', $superAdmin->id)
        ->assertJsonPath('data.0.previous_status', 'suspended')
        ->assertJsonPath('data.0.new_status', 'active');

    $this->getJson("/api/admin/hospitals/{$hospital->id}/users")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $suspendedStaff->id);

    $event = UserAccountStatusEvent::query()->sole();
    expect(fn () => $event->update(['reason' => 'Changed audit text.']))
        ->toThrow(LogicException::class);
    expect(fn () => $event->delete())
        ->toThrow(LogicException::class);
});

test('manual user activation enforces hospital approval membership role status and super admin access', function () {
    [$hospital, $admin] = lifecycleHospital('Manual Activation Rules Hospital');
    [$otherHospital, $otherAdmin] = lifecycleHospital('Other Manual Activation Hospital');
    [$pendingHospital, $pendingAdmin] = lifecycleHospital('Pending Manual Activation Hospital', 'pending_review');
    $staff = $hospital->users()->create([
        'name' => 'Activation Rules Staff',
        'email' => 'activation-rules-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $superAdminTarget = User::factory()->create([
        'name' => 'Suspended Super Admin Target',
        'email' => 'suspended-super-activation@example.test',
    ]);
    $superAdminTarget->forceFill([
        'role' => 'super_admin',
        'status' => 'suspended',
        'hospital_id' => $hospital->id,
    ])->save();

    $admin->forceFill(['status' => 'suspended'])->save();
    $otherAdmin->forceFill(['status' => 'suspended'])->save();
    $pendingAdmin->forceFill(['status' => 'suspended'])->save();
    $superAdmin = lifecycleSuperAdmin();

    $this->actingAs($admin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/users/{$admin->id}/activate", [
            'reason' => 'A hospital administrator must not activate accounts.',
        ])->assertForbidden();

    $this->actingAs($staff)
        ->postJson("/api/admin/hospitals/{$hospital->id}/users/{$admin->id}/activate", [
            'reason' => 'Hospital staff must not activate accounts.',
        ])->assertForbidden();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/hospitals/{$hospital->id}/users/{$admin->id}/activate")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    $this->postJson("/api/admin/hospitals/{$pendingHospital->id}/users/{$pendingAdmin->id}/activate", [
        'reason' => 'The pending hospital must not be able to activate users.',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors('hospital');

    $this->postJson("/api/admin/hospitals/{$hospital->id}/users/{$otherAdmin->id}/activate", [
        'reason' => 'A user from another hospital must not be activated here.',
    ])->assertNotFound();

    $this->postJson("/api/admin/hospitals/{$hospital->id}/users/{$superAdminTarget->id}/activate", [
        'reason' => 'A Super Admin account must never be activated here.',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors('user');

    $this->postJson("/api/admin/hospitals/{$hospital->id}/users/{$staff->id}/activate", [
        'reason' => 'An already active account must not be activated again.',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors('user');

    $this->assertDatabaseHas('users', ['id' => $admin->id, 'status' => 'suspended']);
    $this->assertDatabaseHas('users', ['id' => $otherAdmin->id, 'status' => 'suspended']);
    $this->assertDatabaseHas('users', ['id' => $pendingAdmin->id, 'status' => 'suspended']);
    $this->assertDatabaseHas('users', ['id' => $superAdminTarget->id, 'status' => 'suspended']);
    $this->assertDatabaseCount('user_account_status_events', 0);

    $this->actingAs($admin)
        ->getJson("/api/admin/hospitals/{$hospital->id}/user-status-history")
        ->assertForbidden();

    $this->actingAs($staff)
        ->getJson("/api/admin/hospitals/{$hospital->id}/user-status-history")
        ->assertForbidden();
});
