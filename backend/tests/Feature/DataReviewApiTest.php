<?php

use App\Models\DataReviewSubmission;
use App\Models\Hospital;
use App\Models\MedicalService;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function createReviewHospital(string $name, string $role = 'hospital_admin', string $status = 'active'): array
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Springfield',
        'short_description' => 'A hospital profile summary.',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();

    $user = $hospital->users()->create([
        'name' => "{$name} User",
        'email' => strtolower(str_replace(' ', '-', $name)).'@review.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill(['role' => $role, 'status' => $status])->save();

    return [$hospital, $user];
}

function createReviewSuperAdmin(string $email = 'review-admin@example.test'): User
{
    $admin = User::query()->create([
        'name' => 'Review Administrator',
        'email' => $email,
        'password' => 'correct-horse-battery-staple',
    ]);
    $admin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    return $admin;
}

function createReviewService(Hospital $hospital, array $attributes = []): MedicalService
{
    return $hospital->medicalServices()->create(array_merge([
        'name' => 'Neonatal monitoring',
        'category' => 'Neonatal Monitoring',
        'short_description' => 'Monitoring service description.',
        'detailed_description' => 'Optional details.',
        'service_status' => 'offered',
        'notes' => 'Private staff note.',
    ], $attributes));
}

test('hospital users can submit their data and existing records start unreviewed', function () {
    [$hospital, $admin] = createReviewHospital('Review Hospital');
    $unit = $hospital->incubatorUnits()->create([
        'name' => 'Neonatal unit',
        'total_capacity' => 8,
        'available_capacity' => 3,
        'availability_updated_at' => now(),
    ]);
    $service = createReviewService($hospital);

    $this->actingAs($admin)
        ->getJson('/api/hospital/data-reviews')
        ->assertOk()
        ->assertJsonPath('data.0.review_status', 'not_submitted');

    $this->actingAs($admin)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospital->id}")
        ->assertCreated()
        ->assertJsonPath('data.status', 'pending_review')
        ->assertJsonPath('data.snapshot.name', 'Review Hospital');

    $serviceResponse = $this->actingAs($admin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated()
        ->assertJsonPath('data.snapshot.name', 'Neonatal monitoring')
        ->assertJsonMissingPath('data.snapshot.notes');

    $unitSubmission = $this->actingAs($admin)
        ->postJson("/api/hospital/data-reviews/incubator_unit/{$unit->id}")
        ->assertCreated()
        ->assertJsonPath('data.snapshot.hospital_reported_available_capacity', 3)
        ->assertJsonPath('data.snapshot.availability_last_reported_at', fn ($value) => $value !== null);

    expect($serviceResponse->json('data.status'))->toBe('pending_review')
        ->and($unitSubmission->json('data.snapshot.total_capacity'))->toBe(8)
        ->and(DataReviewSubmission::query()->count())->toBe(3);
});

test('duplicate pending review submissions are rejected by the API and the database index', function () {
    [$hospital, $admin] = createReviewHospital('Pending Uniqueness Hospital');
    $service = createReviewService($hospital);

    $this->actingAs($admin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated()
        ->assertJsonPath('data.snapshot.name', 'Neonatal monitoring');

    $firstSubmission = DataReviewSubmission::query()->sole();

    $this->actingAs($admin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertStatus(409)
        ->assertJsonPath('message', 'This item already has a submission awaiting review.');

    $this->assertDatabaseCount('data_review_submissions', 1);
    expect($firstSubmission->fresh()->snapshot['name'])->toBe('Neonatal monitoring')
        ->and($firstSubmission->fresh()->status)->toBe('pending_review');

    expect(fn () => DataReviewSubmission::query()->create([
        'hospital_id' => $firstSubmission->hospital_id,
        'target_type' => $firstSubmission->target_type,
        'target_id' => $firstSubmission->target_id,
        'status' => 'pending_review',
        'snapshot' => $firstSubmission->snapshot,
        'snapshot_hash' => $firstSubmission->snapshot_hash,
        'submitted_by' => $firstSubmission->submitted_by,
        'submitted_at' => now(),
    ]))->toThrow(UniqueConstraintViolationException::class);

    $this->assertDatabaseCount('data_review_submissions', 1);
});

test('a new submission is allowed after the previous review is no longer pending', function () {
    [$hospital, $admin] = createReviewHospital('Pending Release Hospital');
    $service = createReviewService($hospital);
    $superAdmin = createReviewSuperAdmin('pending-release-admin@example.test');

    $this->actingAs($admin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated();
    $firstSubmission = DataReviewSubmission::query()->sole();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$firstSubmission->id}/request-changes", [
            'reason' => 'Please clarify the service description before resubmission.',
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'changes_requested');

    $this->actingAs($admin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated()
        ->assertJsonPath('data.status', 'pending_review');

    expect(DataReviewSubmission::query()->count())->toBe(2)
        ->and($firstSubmission->fresh()->status)->toBe('changes_requested')
        ->and($firstSubmission->fresh()->snapshot['name'])->toBe('Neonatal monitoring');

    $this->actingAs($superAdmin)
        ->getJson("/api/admin/data-reviews/{$firstSubmission->id}")
        ->assertOk()
        ->assertJsonCount(2, 'data.history');
});

test('hospital staff can review their hospital submission statuses but cannot submit its profile', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Staff Review Hospital');
    $staff = $hospital->users()->create([
        'name' => 'Staff Review User',
        'email' => 'staff-review-user@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $service = createReviewService($hospital);

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospital->id}")
        ->assertCreated();

    $this->actingAs($staff)
        ->getJson('/api/hospital/data-reviews')
        ->assertOk()
        ->assertJsonPath('data.0.review_status', 'pending_review');

    $this->actingAs($staff)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospital->id}")
        ->assertForbidden();

    $this->actingAs($staff)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated()
        ->assertJsonPath('data.status', 'pending_review');
});

test('super admins receive an empty review queue when no submissions exist', function () {
    $superAdmin = createReviewSuperAdmin('empty-review-admin@example.test');

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/data-reviews')
        ->assertOk()
        ->assertExactJson(['data' => []]);
});

test('super admins can approve and request changes while hospital users can resubmit', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Review Flow Hospital');
    $service = createReviewService($hospital);
    $superAdmin = createReviewSuperAdmin();

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated();
    $submission = DataReviewSubmission::query()->sole();

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/approve")
        ->assertForbidden();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/request-changes", ['reason' => ''])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['reason']);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/request-changes", [
            'reason' => '    x',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['reason']);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/request-changes", [
            'reason' => "\u{00A0} x \u{00A0}",
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['reason']);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/request-changes", [
            'reason' => '  Please clarify the reported service description.  ',
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'changes_requested')
        ->assertJsonPath('data.reviewer_name', 'Review Administrator');

    $this->assertDatabaseHas('data_review_submissions', [
        'id' => $submission->id,
        'feedback' => 'Please clarify the reported service description.',
    ]);

    $this->actingAs($hospitalAdmin)
        ->getJson('/api/hospital/data-reviews')
        ->assertOk()
        ->assertJsonPath('data.1.review_status', 'changes_requested');

    $this->actingAs($hospitalAdmin)
        ->patchJson("/api/hospital/services/{$service->id}", [
            'short_description' => 'Updated and clarified service information.',
        ])
        ->assertOk();

    $this->actingAs($hospitalAdmin)
        ->getJson('/api/hospital/data-reviews')
        ->assertOk()
        ->assertJsonPath('data.1.current_version_changed', true);

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated()
        ->assertJsonPath('data.status', 'pending_review');

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/data-reviews?status=changes_requested&type=medical_service')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.feedback', 'Please clarify the reported service description.');

    $latestSubmission = DataReviewSubmission::query()->latest('id')->firstOrFail();
    $this->actingAs($superAdmin)
        ->getJson("/api/admin/data-reviews/{$latestSubmission->id}")
        ->assertOk()
        ->assertJsonCount(2, 'data.history')
        ->assertJsonPath('data.history.1.reviewer_name', 'Review Administrator')
        ->assertJsonPath('data.history.1.feedback', 'Please clarify the reported service description.');

    expect(DataReviewSubmission::query()->where('target_id', $service->id)->count())->toBe(2);
});

test('super admins can filter review submissions by hospital status and type', function () {
    [$hospitalA, $hospitalAdminA] = createReviewHospital('Filter Hospital A');
    [$hospitalB] = createReviewHospital('Filter Hospital B');
    $superAdmin = createReviewSuperAdmin('review-filter-admin@example.test');
    $serviceA = createReviewService($hospitalA);
    $serviceB = createReviewService($hospitalB);

    $this->actingAs($hospitalAdminA)
        ->postJson("/api/hospital/data-reviews/medical_service/{$serviceA->id}")
        ->assertCreated();
    $pendingSubmission = DataReviewSubmission::query()->sole();

    $this->actingAs($hospitalAdminA)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospitalA->id}")
        ->assertCreated();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$pendingSubmission->id}/request-changes", [
            'reason' => 'Please clarify the service description.',
        ])
        ->assertOk();

    $hospitalBAdmin = $hospitalB->users()->create([
        'name' => 'Filter Hospital B Admin',
        'email' => 'filter-hospital-b@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $hospitalBAdmin->forceFill(['role' => 'hospital_admin', 'status' => 'active'])->save();
    $this->actingAs($hospitalBAdmin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$serviceB->id}")
        ->assertCreated();

    $this->actingAs($superAdmin)
        ->getJson("/api/admin/data-reviews?hospital_id={$hospitalA->id}&status=changes_requested&type=medical_service")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.hospital_id', $hospitalA->id)
        ->assertJsonPath('data.0.status', 'changes_requested')
        ->assertJsonPath('data.0.target_type', 'medical_service')
        ->assertJsonPath('data.0.feedback', 'Please clarify the service description.');

    $this->actingAs($superAdmin)
        ->getJson('/api/admin/data-reviews?hospital_id=999999')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['hospital_id']);
});

test('reviewing profile service and reported resource statuses does not change current availability', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Availability Independence Hospital');
    $unit = $hospital->incubatorUnits()->create([
        'name' => 'Neonatal unit',
        'total_capacity' => 9,
        'available_capacity' => 2,
        'availability_updated_at' => now()->subDay(),
    ]);
    $equipment = $hospital->equipment()->create([
        'name' => 'Patient monitor',
        'quantity' => 2,
        'tracking_mode' => 'shared_quantity',
        'operational_status' => 'operational',
        'availability_status' => 'available',
        'availability_reported_at' => now()->subDay(),
    ]);
    $service = createReviewService($hospital);
    $superAdmin = createReviewSuperAdmin('independence-admin@example.test');

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospital->id}")
        ->assertCreated();
    $profileSubmission = DataReviewSubmission::query()->latest('id')->firstOrFail();
    $unit->update([
        'available_capacity' => 1,
        'availability_updated_at' => now(),
    ]);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$profileSubmission->id}/approve")
        ->assertOk()
        ->assertJsonPath('data.status', 'approved_for_publication');

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated();
    $serviceSubmission = DataReviewSubmission::query()->latest('id')->firstOrFail();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$serviceSubmission->id}/approve")
        ->assertOk();

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/hospital_equipment/{$equipment->id}")
        ->assertCreated()
        ->assertJsonPath('data.snapshot.hospital_reported_availability_status', 'available')
        ->assertJsonPath('data.snapshot.availability_last_reported_at', fn ($value) => $value !== null);
    $equipmentSubmission = DataReviewSubmission::query()->latest('id')->firstOrFail();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$equipmentSubmission->id}/approve")
        ->assertOk();

    $this->assertDatabaseHas('incubator_units', [
        'id' => $unit->id,
        'total_capacity' => 9,
        'available_capacity' => 1,
    ]);
    $this->assertDatabaseHas('hospital_equipment', [
        'id' => $equipment->id,
        'availability_status' => 'available',
    ]);
    expect($hospital->fresh()->status)->toBe('approved')
        ->and($unit->fresh()->available_capacity)->toBe(1);
});

test('availability changes after submission invalidate the submitted snapshot', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Availability Snapshot Hospital');
    $superAdmin = createReviewSuperAdmin('availability-snapshot-admin@example.test');
    $equipment = $hospital->equipment()->create([
        'name' => 'Patient monitor',
        'quantity' => 1,
        'tracking_mode' => 'individual',
        'operational_status' => 'operational',
        'availability_status' => 'available',
        'availability_reported_at' => now(),
    ]);

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/hospital_equipment/{$equipment->id}")
        ->assertCreated();
    $submission = DataReviewSubmission::query()->sole();

    $equipment->update([
        'availability_status' => 'in_use',
        'availability_reported_at' => now()->addSecond(),
    ]);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/approve")
        ->assertStatus(409);

    $this->assertDatabaseHas('hospital_equipment', [
        'id' => $equipment->id,
        'availability_status' => 'in_use',
    ]);
});

test('deleted records remain in review history but cannot be approved', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Deleted Review Record Hospital');
    $superAdmin = createReviewSuperAdmin('deleted-review-admin@example.test');
    $service = createReviewService($hospital);

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/medical_service/{$service->id}")
        ->assertCreated();
    $submission = DataReviewSubmission::query()->sole();
    $service->delete();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/approve")
        ->assertStatus(409)
        ->assertJsonPath('message', 'The submitted hospital record no longer exists and cannot be approved.');

    $this->assertDatabaseHas('data_review_submissions', [
        'id' => $submission->id,
        'status' => 'pending_review',
    ]);
});

test('review submissions are isolated and metadata cannot be spoofed', function () {
    [$hospitalA, $adminA] = createReviewHospital('Review Hospital A');
    [$hospitalB] = createReviewHospital('Review Hospital B');
    $serviceA = createReviewService($hospitalA);
    $serviceB = createReviewService($hospitalB);

    $this->actingAs($adminA)
        ->postJson("/api/hospital/data-reviews/medical_service/{$serviceB->id}")
        ->assertNotFound();

    $this->actingAs($adminA)
        ->postJson("/api/hospital/data-reviews/medical_service/{$serviceA->id}", [
            'hospital_id' => $hospitalB->id,
            'reviewer_id' => 1,
            'status' => 'approved_for_publication',
            'reviewed_at' => now()->toISOString(),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['hospital_id', 'reviewer_id', 'status', 'reviewed_at']);

    $staffA = $hospitalA->users()->create([
        'name' => 'Review Hospital A Staff',
        'email' => 'review-staff-a@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staffA->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $this->actingAs($staffA)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospitalA->id}")
        ->assertForbidden();

    $this->actingAs($adminA)
        ->postJson("/api/hospital/data-reviews/medical_service/{$serviceA->id}")
        ->assertCreated();
    $submission = DataReviewSubmission::query()->sole();

    $this->actingAs(createReviewSuperAdmin('spoof-admin@example.test'))
        ->postJson("/api/admin/data-reviews/{$submission->id}/approve", [
            'reviewer_id' => 999,
            'reviewed_at' => '2000-01-01',
            'status' => 'approved_for_publication',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['reviewer_id', 'reviewed_at', 'status']);

    $this->assertDatabaseHas('data_review_submissions', [
        'id' => $submission->id,
        'hospital_id' => $hospitalA->id,
        'status' => 'pending_review',
        'reviewed_by' => null,
    ]);
});

test('review approval is rejected if the reviewed data changed after submission', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Changed Data Hospital');
    $superAdmin = createReviewSuperAdmin('changed-data-admin@example.test');

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospital->id}")
        ->assertCreated();
    $submission = DataReviewSubmission::query()->sole();

    $hospital->update(['short_description' => 'Changed after the submission.']);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/approve")
        ->assertStatus(409);

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/request-changes", [
            'reason' => 'The submitted profile has changed; please resubmit it.',
        ])
        ->assertOk()
        ->assertJsonPath('data.status', 'changes_requested');

    $this->assertDatabaseHas('data_review_submissions', [
        'id' => $submission->id,
        'status' => 'changes_requested',
        'reviewed_by' => $superAdmin->id,
    ]);
});

test('editing approved information makes the new current version unsubmitted', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Approved Version Hospital');
    $superAdmin = createReviewSuperAdmin('approved-version-admin@example.test');

    $this->actingAs($hospitalAdmin)
        ->postJson("/api/hospital/data-reviews/hospital_profile/{$hospital->id}")
        ->assertCreated();
    $submission = DataReviewSubmission::query()->sole();

    $this->actingAs($superAdmin)
        ->postJson("/api/admin/data-reviews/{$submission->id}/approve")
        ->assertOk();

    $hospital->update(['short_description' => 'A newly changed profile summary.']);

    $this->actingAs($hospitalAdmin)
        ->getJson('/api/hospital/data-reviews')
        ->assertOk()
        ->assertJsonPath('data.0.review_status', 'not_submitted')
        ->assertJsonPath('data.0.current_version_changed', true);
});

test('review endpoints reject guests inactive accounts and unauthorized roles', function () {
    [$hospital, $hospitalAdmin] = createReviewHospital('Restricted Review Hospital');
    $inactive = $hospital->users()->create([
        'name' => 'Inactive User',
        'email' => 'inactive-review@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $inactive->forceFill(['role' => 'hospital_staff', 'status' => 'suspended'])->save();
    $superAdmin = createReviewSuperAdmin('restricted-review-admin@example.test');

    $this->getJson('/api/admin/data-reviews')->assertUnauthorized();
    $this->getJson('/api/hospital/data-reviews')->assertUnauthorized();

    $this->actingAs($inactive)
        ->getJson('/api/hospital/data-reviews')
        ->assertForbidden();

    $this->actingAs($hospitalAdmin)
        ->getJson('/api/admin/data-reviews')
        ->assertForbidden();

    $staff = $hospital->users()->create([
        'name' => 'Restricted Review Staff',
        'email' => 'restricted-review-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staff->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    $this->actingAs($staff)
        ->getJson('/api/admin/data-reviews')
        ->assertForbidden();

    $this->actingAs($superAdmin)
        ->getJson('/api/hospital/data-reviews')
        ->assertForbidden();
});
