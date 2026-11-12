<?php

use App\Models\Hospital;
use App\Models\MedicalService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function createMedicalServiceHospital(string $name, string $role = 'hospital_admin', string $status = 'active'): array
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Springfield',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();

    $user = $hospital->users()->create([
        'name' => "{$name} User",
        'email' => strtolower(str_replace(' ', '-', $name)).'@services.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill([
        'role' => $role,
        'status' => $status,
    ])->save();

    return [$hospital, $user];
}

function validMedicalServicePayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Neonatal Monitoring',
        'category' => 'Neonatal Monitoring',
        'short_description' => 'Round-the-clock monitoring for low-risk babies.',
        'detailed_description' => 'Detailed support for stable infants.',
        'service_status' => 'offered',
        'operating_hours' => '24/7',
        'notes' => 'Internal note for staff only.',
    ], $overrides);
}

function createMedicalService(Hospital $hospital, array $attributes = []): MedicalService
{
    return $hospital->medicalServices()->create(array_merge([
        'name' => 'Neonatal Monitoring',
        'category' => 'Neonatal Monitoring',
        'short_description' => 'Round-the-clock monitoring for low-risk babies.',
        'service_status' => 'offered',
    ], $attributes));
}

test('hospital admins can create list view update and delete medical services', function () {
    foreach (['hospital_admin'] as $role) {
        [$hospital, $user] = createMedicalServiceHospital("Services {$role}", $role);

        $created = $this->actingAs($user)
            ->postJson('/api/hospital/services', validMedicalServicePayload())
            ->assertCreated()
            ->assertJsonPath('data.hospital_id', $hospital->id)
            ->assertJsonPath('data.name', 'Neonatal Monitoring')
            ->assertJsonPath('data.category', 'Neonatal Monitoring')
            ->assertJsonPath('data.service_status', 'offered');

        $serviceId = $created->json('data.id');

        $this->actingAs($user)
            ->getJson('/api/hospital/services')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $serviceId);

        $this->actingAs($user)
            ->getJson("/api/hospital/services/{$serviceId}")
            ->assertOk()
            ->assertJsonPath('data.id', $serviceId);

        $this->actingAs($user)
            ->patchJson("/api/hospital/services/{$serviceId}", [
                'name' => 'Updated service',
                'service_status' => 'temporarily_unavailable',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated service')
            ->assertJsonPath('data.service_status', 'temporarily_unavailable');

        $this->actingAs($user)
            ->deleteJson("/api/hospital/services/{$serviceId}")
            ->assertOk();

        $this->assertDatabaseMissing('medical_services', ['id' => $serviceId]);
    }
});

test('hospital staff can view but cannot create update or delete medical services', function () {
    [$hospital, $staff] = createMedicalServiceHospital('Read-only Services Hospital', 'hospital_staff');
    [$otherHospital] = createMedicalServiceHospital('Other Read-only Services Hospital');
    $service = createMedicalService($hospital);
    $otherService = createMedicalService($otherHospital);

    $this->actingAs($staff)
        ->getJson('/api/hospital/services')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $service->id);

    $this->actingAs($staff)
        ->getJson("/api/hospital/services/{$service->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $service->id);

    $this->actingAs($staff)
        ->postJson('/api/hospital/services', validMedicalServicePayload())
        ->assertForbidden();

    $this->actingAs($staff)
        ->patchJson("/api/hospital/services/{$service->id}", [
            'service_status' => 'temporarily_unavailable',
        ])
        ->assertForbidden();

    $this->actingAs($staff)
        ->deleteJson("/api/hospital/services/{$service->id}")
        ->assertForbidden();

    $this->actingAs($staff)
        ->patchJson("/api/hospital/services/{$otherService->id}", [
            'name' => 'Changed by another hospital',
        ])
        ->assertNotFound();

    $this->actingAs($staff)
        ->deleteJson("/api/hospital/services/{$otherService->id}")
        ->assertNotFound();

    $this->assertDatabaseHas('medical_services', [
        'id' => $service->id,
        'name' => 'Neonatal Monitoring',
        'hospital_id' => $hospital->id,
    ]);
});

test('medical services are isolated by hospital and cannot be spoofed', function () {
    [$hospitalA, $adminA] = createMedicalServiceHospital('Service Hospital A');
    [$hospitalB, $staffB] = createMedicalServiceHospital('Service Hospital B');

    $serviceA = createMedicalService($hospitalA, ['name' => 'A service']);
    $serviceB = createMedicalService($hospitalB, ['name' => 'B service']);

    $this->actingAs($adminA)
        ->getJson('/api/hospital/services')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $serviceA->id);

    $this->actingAs($adminA)
        ->getJson("/api/hospital/services/{$serviceB->id}")
        ->assertNotFound();

    $this->actingAs($adminA)
        ->patchJson("/api/hospital/services/{$serviceB->id}", ['name' => 'hacked'])
        ->assertNotFound();

    $this->actingAs($adminA)
        ->deleteJson("/api/hospital/services/{$serviceB->id}")
        ->assertNotFound();

    $this->actingAs($adminA)
        ->postJson('/api/hospital/services', [
            ...validMedicalServicePayload(),
            'hospital_id' => $hospitalB->id,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['hospital_id']);

    $this->actingAs($staffB)
        ->patchJson("/api/hospital/services/{$serviceA->id}", ['name' => 'Unauthorised change'])
        ->assertNotFound();
});

test('medical service validation accepts optional fields and rejects invalid values', function () {
    [, $user] = createMedicalServiceHospital('Validation Hospital');

    $this->actingAs($user)
        ->postJson('/api/hospital/services', [
            'name' => 'Ambulatory Consultation',
            'category' => 'Pediatric Consultation',
            'short_description' => 'Supports pediatric follow-up.',
            'detailed_description' => 'Optional details',
            'service_status' => 'not_confirmed',
            'operating_hours' => 'Monday-Friday 09:00-17:00',
            'notes' => 'Private internal note',
        ])
        ->assertCreated();

    foreach ([
        ['name' => ''],
        ['category' => 'Unknown category'],
        ['short_description' => ''],
        ['service_status' => 'invalid'],
        ['name' => str_repeat('a', 256)],
    ] as $payload) {
        $this->actingAs($user)
            ->postJson('/api/hospital/services', validMedicalServicePayload($payload))
            ->assertUnprocessable();
    }
});

test('guests inactive accounts and unauthorized roles cannot access medical services', function () {
    [$hospital, $admin] = createMedicalServiceHospital('Restricted Service Hospital');
    $inactive = $hospital->users()->create([
        'name' => 'Inactive Employee',
        'email' => 'inactive-service@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $inactive->forceFill(['role' => 'hospital_staff', 'status' => 'pending'])->save();

    $this->getJson('/api/hospital/services')->assertUnauthorized();

    $this->actingAs($inactive)
        ->getJson('/api/hospital/services')->assertForbidden();

    $superAdmin = User::query()->create([
        'name' => 'Super Admin',
        'email' => 'super@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();

    $this->actingAs($superAdmin)
        ->getJson('/api/hospital/services')
        ->assertForbidden();

    $service = createMedicalService($hospital, ['name' => 'Protected']);

    $this->actingAs($admin)
        ->getJson("/api/hospital/services/{$service->id}")
        ->assertOk();
});
