<?php

use App\Models\DataReviewSubmission;
use App\Models\Hospital;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function analyticsHospital(string $name, string $status): Hospital
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Analytics City',
    ]);
    $hospital->forceFill(['status' => $status])->save();

    return $hospital;
}

function analyticsUser(Hospital $hospital, string $role, string $email): User
{
    $user = $hospital->users()->create([
        'name' => 'Analytics Test User',
        'email' => $email,
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill([
        'role' => $role,
        'status' => 'active',
    ])->save();

    return $user;
}

function analyticsSubmission(Hospital $hospital, string $status): DataReviewSubmission
{
    return DataReviewSubmission::query()->create([
        'hospital_id' => $hospital->id,
        'target_type' => 'hospital_profile',
        'target_id' => $hospital->id,
        'status' => $status,
        'snapshot' => ['name' => $hospital->name],
        'snapshot_hash' => hash('sha256', $hospital->name),
        'submitted_at' => now(),
    ]);
}

test('analytics endpoint requires an active super admin', function () {
    $hospital = analyticsHospital('Access Hospital', 'approved');
    $hospitalAdmin = analyticsUser($hospital, 'hospital_admin', 'analytics-hospital@example.test');
    $hospitalStaff = analyticsUser($hospital, 'hospital_staff', 'analytics-staff@example.test');
    $suspendedAdmin = User::query()->create([
        'name' => 'Suspended Analytics Administrator',
        'email' => 'suspended-analytics-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $suspendedAdmin->forceFill(['role' => 'super_admin', 'status' => 'suspended'])->save();

    $this->getJson('/api/admin/analytics')->assertUnauthorized();

    $this->actingAs($hospitalAdmin)
        ->getJson('/api/admin/analytics')
        ->assertForbidden();

    $this->actingAs($hospitalStaff)
        ->getJson('/api/admin/analytics')
        ->assertForbidden();

    $this->actingAs($suspendedAdmin)
        ->getJson('/api/admin/analytics')
        ->assertForbidden();
});

test('super admin analytics reflect hospital inventory and review records', function () {
    $pendingHospital = analyticsHospital('Pending Analytics Hospital', 'pending_review');
    $approvedHospital = analyticsHospital('Approved Analytics Hospital', 'approved');
    analyticsHospital('Rejected Analytics Hospital', 'rejected');
    analyticsHospital('Suspended Analytics Hospital', 'suspended');

    $superAdmin = User::query()->create([
        'name' => 'Analytics Administrator',
        'email' => 'analytics-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    $approvedHospital->incubatorUnits()->create([
        'name' => 'Neonatal Unit One',
        'total_capacity' => 8,
        'available_capacity' => 3,
    ]);
    $approvedHospital->incubatorUnits()->create([
        'name' => 'Neonatal Unit Two',
        'total_capacity' => 4,
        'available_capacity' => 1,
    ]);
    $approvedHospital->equipment()->create([
        'name' => 'Patient monitor',
        'quantity' => 2,
        'tracking_mode' => 'shared_quantity',
        'operational_status' => 'operational',
        'availability_status' => 'available',
    ]);
    $approvedHospital->medicalServices()->create([
        'name' => 'Neonatal monitoring',
        'category' => 'Neonatal Monitoring',
        'short_description' => 'Monitoring service.',
        'service_status' => 'offered',
    ]);

    analyticsSubmission($pendingHospital, 'pending_review');
    analyticsSubmission($approvedHospital, 'approved_for_publication');
    analyticsSubmission($approvedHospital, 'changes_requested');

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/analytics')
        ->assertOk()
        ->assertJsonPath('data.hospitals.total', 4)
        ->assertJsonPath('data.hospitals.by_status.pending_review', 1)
        ->assertJsonPath('data.hospitals.by_status.approved', 1)
        ->assertJsonPath('data.hospitals.by_status.rejected', 1)
        ->assertJsonPath('data.hospitals.by_status.suspended', 1)
        ->assertJsonPath('data.registration_requests.pending', 1)
        ->assertJsonPath('data.incubators.units', 2)
        ->assertJsonPath('data.incubators.total_capacity', 12)
        ->assertJsonPath('data.incubators.hospital_reported_available_capacity', 4)
        ->assertJsonPath('data.data_reviews.total', 3)
        ->assertJsonPath('data.data_reviews.by_status.pending_review', 1)
        ->assertJsonPath('data.data_reviews.by_status.approved_for_publication', 1)
        ->assertJsonPath('data.data_reviews.by_status.changes_requested', 1)
        ->assertJsonPath('data.equipment.total', 1)
        ->assertJsonPath('data.medical_services.total', 1)
        ->assertJsonStructure(['data' => ['generated_at']]);
});

test('analytics return actual zero values for empty tables', function () {
    $superAdmin = User::query()->create([
        'name' => 'Empty Analytics Administrator',
        'email' => 'empty-analytics-admin@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/analytics')
        ->assertOk()
        ->assertJsonPath('data.hospitals.total', 0)
        ->assertJsonPath('data.hospitals.by_status.pending_review', 0)
        ->assertJsonPath('data.registration_requests.pending', 0)
        ->assertJsonPath('data.incubators.units', 0)
        ->assertJsonPath('data.incubators.total_capacity', 0)
        ->assertJsonPath('data.incubators.hospital_reported_available_capacity', 0)
        ->assertJsonPath('data.data_reviews.total', 0)
        ->assertJsonPath('data.data_reviews.by_status.pending_review', 0)
        ->assertJsonPath('data.equipment.total', 0)
        ->assertJsonPath('data.medical_services.total', 0);
});
