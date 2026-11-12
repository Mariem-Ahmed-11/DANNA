<?php

use App\Models\DataReviewSubmission;
use App\Models\Hospital;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function createWorkspaceHospital(string $name, string $role = 'hospital_admin'): array
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Workspace City',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();

    $user = $hospital->users()->create([
        'name' => "{$name} User",
        'email' => strtolower(str_replace(' ', '-', $name)).'@workspace.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill(['role' => $role, 'status' => 'active'])->save();

    return [$hospital, $user];
}

function createWorkspaceReview(Hospital $hospital, string $status): DataReviewSubmission
{
    return DataReviewSubmission::query()->create([
        'hospital_id' => $hospital->id,
        'target_type' => 'hospital_profile',
        'target_id' => $hospital->id,
        'status' => $status,
        'snapshot' => ['name' => $hospital->name],
        'snapshot_hash' => hash('sha256', $hospital->name.$status),
        'submitted_at' => now(),
    ]);
}

test('hospital workspace summary contains only the authenticated hospital statistics', function () {
    [$hospitalA, $adminA] = createWorkspaceHospital('Workspace Hospital A');
    [$hospitalB] = createWorkspaceHospital('Workspace Hospital B');
    $staffA = $hospitalA->users()->create([
        'name' => 'Workspace Hospital A Staff',
        'email' => 'workspace-hospital-a-staff@workspace.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staffA->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();

    $hospitalA->incubatorUnits()->create([
        'name' => 'A NICU',
        'total_capacity' => 12,
        'available_capacity' => 4,
    ]);
    $hospitalB->incubatorUnits()->create([
        'name' => 'B NICU',
        'total_capacity' => 50,
        'available_capacity' => 45,
    ]);
    $hospitalA->equipment()->create([
        'name' => 'A monitor',
        'quantity' => 2,
        'tracking_mode' => 'shared_quantity',
        'operational_status' => 'operational',
        'availability_status' => 'available',
    ]);
    $hospitalB->equipment()->create([
        'name' => 'B monitor',
        'quantity' => 9,
        'tracking_mode' => 'shared_quantity',
        'operational_status' => 'operational',
        'availability_status' => 'available',
    ]);
    $hospitalA->medicalServices()->create([
        'name' => 'A service',
        'category' => 'Neonatal Monitoring',
        'short_description' => 'A service description.',
        'service_status' => 'offered',
    ]);
    $hospitalB->medicalServices()->create([
        'name' => 'B service',
        'category' => 'Neonatal Monitoring',
        'short_description' => 'B service description.',
        'service_status' => 'offered',
    ]);
    createWorkspaceReview($hospitalA, 'pending_review');
    createWorkspaceReview($hospitalA, 'approved_for_publication');
    createWorkspaceReview($hospitalA, 'changes_requested');
    createWorkspaceReview($hospitalB, 'pending_review');

    $this->actingAs($adminA)
        ->getJson('/api/hospital/workspace')
        ->assertOk()
        ->assertJsonPath('data.hospital.id', $hospitalA->id)
        ->assertJsonPath('data.hospital.name', 'Workspace Hospital A')
        ->assertJsonPath('data.hospital_status', 'approved')
        ->assertJsonPath('data.incubators.units', 1)
        ->assertJsonPath('data.incubators.total_capacity', 12)
        ->assertJsonPath('data.incubators.hospital_reported_available_capacity', 4)
        ->assertJsonPath('data.equipment.total', 1)
        ->assertJsonPath('data.medical_services.total', 1)
        ->assertJsonPath('data.staff.total', 1)
        ->assertJsonPath('data.data_reviews.pending', 1)
        ->assertJsonPath('data.data_reviews.approved', 1)
        ->assertJsonPath('data.data_reviews.changes_requested', 1)
        ->assertJsonCount(3, 'data.data_reviews.submissions')
        ->assertJsonMissing(['name' => 'Workspace Hospital B'])
        ->assertJsonMissingPath('data.hospital.phone')
        ->assertJsonMissingPath('data.hospital.users');
});

test('hospital admins and staff can view their own workspace while other roles cannot', function () {
    [$hospital, $admin] = createWorkspaceHospital('Workspace Access Hospital');
    $staff = $hospital->users()->create([
        'name' => 'Workspace Staff',
        'email' => 'workspace-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $suspendedAdmin = $hospital->users()->create([
        'name' => 'Suspended Workspace Admin',
        'email' => 'workspace-suspended@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $suspendedAdmin->forceFill(['role' => 'hospital_admin', 'status' => 'suspended'])->save();
    $superAdmin = User::query()->create([
        'name' => 'Workspace Super Admin',
        'email' => 'workspace-super@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    $this->getJson('/api/hospital/workspace')->assertUnauthorized();

    $this->actingAs($admin)
        ->getJson('/api/hospital/workspace')
        ->assertOk();

    $this->actingAs($staff)
        ->getJson('/api/hospital/workspace')
        ->assertOk();

    $this->actingAs($superAdmin)
        ->getJson('/api/hospital/workspace')
        ->assertForbidden();

    $this->actingAs($suspendedAdmin)
        ->getJson('/api/hospital/workspace')
        ->assertForbidden();
});

test('empty hospital workspace returns real zero counts', function () {
    [, $admin] = createWorkspaceHospital('Empty Workspace Hospital');

    $this->actingAs($admin)
        ->getJson('/api/hospital/workspace')
        ->assertOk()
        ->assertJsonPath('data.incubators.units', 0)
        ->assertJsonPath('data.incubators.total_capacity', 0)
        ->assertJsonPath('data.incubators.hospital_reported_available_capacity', 0)
        ->assertJsonPath('data.equipment.total', 0)
        ->assertJsonPath('data.medical_services.total', 0)
        ->assertJsonPath('data.staff.total', 0)
        ->assertJsonPath('data.data_reviews.pending', 0)
        ->assertJsonPath('data.data_reviews.approved', 0)
        ->assertJsonPath('data.data_reviews.changes_requested', 0)
        ->assertJsonCount(0, 'data.data_reviews.submissions');
});
