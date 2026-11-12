<?php

use App\Models\Hospital;
use App\Models\HospitalEquipment;
use App\Models\IncubatorUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function createEquipmentHospital(string $name, string $role = 'hospital_admin', string $status = 'active'): array
{
    $hospital = Hospital::query()->create([
        'name' => $name,
        'city' => 'Springfield',
    ]);
    $hospital->forceFill(['status' => 'approved'])->save();

    $user = $hospital->users()->create([
        'name' => "{$name} User",
        'email' => strtolower(str_replace(' ', '-', $name)).'@equipment.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill([
        'role' => $role,
        'status' => $status,
    ])->save();

    return [$hospital, $user];
}

function createEquipmentUnit(Hospital $hospital, string $name = 'Neonatal Unit'): IncubatorUnit
{
    return $hospital->incubatorUnits()->create([
        'name' => $name,
        'total_capacity' => 12,
        'available_capacity' => 4,
        'availability_updated_at' => now(),
    ]);
}

function validEquipmentPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Patient monitor',
        'quantity' => 3,
        'tracking_mode' => 'shared_quantity',
        'asset_label' => null,
        'operational_status' => 'operational',
        'availability_status' => 'available',
        'notes' => 'Internal inventory note',
    ], $overrides);
}

function createEquipment(Hospital $hospital, array $attributes = []): HospitalEquipment
{
    return $hospital->equipment()->create(array_merge([
        'name' => 'Patient monitor',
        'quantity' => 3,
        'tracking_mode' => 'shared_quantity',
        'operational_status' => 'operational',
        'availability_status' => 'available',
        'notes' => 'Internal inventory note',
        'availability_reported_at' => now(),
    ], $attributes));
}

test('equipment CRUD remains available to active hospital admins', function () {
    foreach (['hospital_admin'] as $role) {
        [$hospital, $user] = createEquipmentHospital("CRUD {$role}", $role);
        $unit = createEquipmentUnit($hospital);

        $created = $this->actingAs($user)
            ->postJson('/api/hospital/equipment', validEquipmentPayload([
                'incubator_unit_id' => $unit->id,
            ]))
            ->assertCreated()
            ->assertJsonPath('data.hospital_id', $hospital->id)
            ->assertJsonPath('data.incubator_unit_id', $unit->id)
            ->assertJsonPath('data.availability_status', 'available')
            ->assertJsonPath('data.notes', 'Internal inventory note')
            ->assertJsonPath('data.availability_reported_at', fn ($value) => $value !== '2000-01-01T00:00:00Z');

        $equipmentId = $created->json('data.id');

        $this->getJson('/api/hospital/equipment')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $equipmentId)
            ->assertJsonPath('data.0.notes', 'Internal inventory note');

        $this->getJson("/api/hospital/equipment/{$equipmentId}")
            ->assertOk()
            ->assertJsonPath('data.id', $equipmentId)
            ->assertJsonPath('data.notes', 'Internal inventory note');

        $this->patchJson("/api/hospital/equipment/{$equipmentId}", [
            'name' => 'Updated monitor',
            'operational_status' => 'needs_maintenance',
            'availability_status' => 'in_use',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated monitor')
            ->assertJsonPath('data.operational_status', 'needs_maintenance')
            ->assertJsonPath('data.availability_status', 'in_use')
            ->assertJsonPath('data.notes', 'Internal inventory note');

        $this->deleteJson("/api/hospital/equipment/{$equipmentId}")
            ->assertOk();
        $this->assertDatabaseMissing('hospital_equipment', ['id' => $equipmentId]);
    }
});

test('hospital staff can update only equipment operational and availability statuses', function () {
    [$hospital, $staff] = createEquipmentHospital('Staff Equipment Hospital', 'hospital_staff');
    [$otherHospital] = createEquipmentHospital('Other Equipment Hospital');
    $unit = createEquipmentUnit($hospital);
    $otherUnit = createEquipmentUnit($otherHospital);
    $equipment = createEquipment($hospital, ['incubator_unit_id' => $unit->id]);
    $otherEquipment = createEquipment($otherHospital, ['incubator_unit_id' => $otherUnit->id]);
    $originalTimestamp = $equipment->availability_reported_at->toISOString();

    $this->actingAs($staff)
        ->getJson('/api/hospital/equipment')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $equipment->id);

    $this->actingAs($staff)
        ->getJson("/api/hospital/equipment/{$equipment->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $equipment->id);

    $this->travel(1)->minutes();
    $this->actingAs($staff)
        ->patchJson("/api/hospital/equipment/{$equipment->id}", [
            'operational_status' => 'needs_maintenance',
        ])
        ->assertOk()
        ->assertJsonPath('data.operational_status', 'needs_maintenance')
        ->assertJsonPath('data.availability_status', 'available')
        ->assertJsonPath('data.availability_reported_at', $originalTimestamp);

    $this->travel(1)->minutes();
    $updated = $this->actingAs($staff)
        ->patchJson("/api/hospital/equipment/{$equipment->id}", [
            'availability_status' => 'in_use',
        ])
        ->assertOk()
        ->assertJsonPath('data.operational_status', 'needs_maintenance')
        ->assertJsonPath('data.availability_status', 'in_use')
        ->assertJsonPath('data.quantity', 3)
        ->assertJsonPath('data.tracking_mode', 'shared_quantity');

    expect($updated->json('data.availability_reported_at'))->not->toBe($originalTimestamp);

    foreach ([
        ['name' => 'Changed monitor'],
        ['quantity' => 50],
        ['tracking_mode' => 'individual'],
        ['asset_label' => 'CHANGED-01'],
        ['hospital_id' => $otherHospital->id],
        ['incubator_unit_id' => $otherUnit->id],
        ['notes' => 'Changed private note'],
        ['availability_reported_at' => '2000-01-01T00:00:00Z'],
        ['availability_status' => 'available', 'quantity' => 50],
    ] as $restrictedPayload) {
        $this->actingAs($staff)
            ->patchJson("/api/hospital/equipment/{$equipment->id}", $restrictedPayload)
            ->assertUnprocessable();
    }

    $this->actingAs($staff)
        ->patchJson("/api/hospital/equipment/{$equipment->id}", [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['operational_status']);

    $this->actingAs($staff)
        ->postJson('/api/hospital/equipment', validEquipmentPayload())
        ->assertForbidden();

    $this->actingAs($staff)
        ->deleteJson("/api/hospital/equipment/{$equipment->id}")
        ->assertForbidden();

    $this->actingAs($staff)
        ->patchJson("/api/hospital/equipment/{$otherEquipment->id}", [
            'availability_status' => 'unavailable',
        ])
        ->assertNotFound();

    $this->assertDatabaseHas('hospital_equipment', [
        'id' => $equipment->id,
        'name' => 'Patient monitor',
        'quantity' => 3,
        'tracking_mode' => 'shared_quantity',
        'asset_label' => null,
        'incubator_unit_id' => $unit->id,
        'hospital_id' => $hospital->id,
        'notes' => 'Internal inventory note',
        'operational_status' => 'needs_maintenance',
        'availability_status' => 'in_use',
    ]);
    $this->assertDatabaseHas('hospital_equipment', [
        'id' => $otherEquipment->id,
        'hospital_id' => $otherHospital->id,
        'availability_status' => 'available',
    ]);
});

test('equipment reads and mutations are isolated by hospital for admins and staff', function () {
    [$hospitalA, $adminA] = createEquipmentHospital('Equipment Hospital A');
    $staffA = $hospitalA->users()->create([
        'name' => 'Hospital A Staff',
        'email' => 'equipment-staff-a@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staffA->forceFill(['role' => 'hospital_staff', 'status' => 'active'])->save();
    [$hospitalB] = createEquipmentHospital('Equipment Hospital B');
    $unitA = createEquipmentUnit($hospitalA, 'Unit A');
    $unitB = createEquipmentUnit($hospitalB, 'Unit B');
    $equipmentA = createEquipment($hospitalA, ['incubator_unit_id' => $unitA->id]);
    $equipmentB = createEquipment($hospitalB, ['incubator_unit_id' => $unitB->id]);

    foreach ([$adminA, $staffA] as $user) {
        $this->actingAs($user)
            ->getJson('/api/hospital/equipment')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $equipmentA->id);

        $this->actingAs($user)
            ->getJson("/api/hospital/equipment/{$equipmentB->id}")
            ->assertNotFound();

        $this->actingAs($user)
            ->patchJson("/api/hospital/equipment/{$equipmentB->id}", ['name' => 'Changed by A'])
            ->assertNotFound();

        $this->actingAs($user)
            ->deleteJson("/api/hospital/equipment/{$equipmentB->id}")
            ->assertNotFound();

        $spoofedCreate = $this->actingAs($user)
            ->postJson('/api/hospital/equipment', validEquipmentPayload([
                'hospital_id' => $hospitalB->id,
                'incubator_unit_id' => $unitB->id,
            ]));
        if ($user->role === 'hospital_staff') {
            $spoofedCreate->assertForbidden();
        } else {
            $spoofedCreate->assertUnprocessable()
                ->assertJsonValidationErrors(['hospital_id', 'incubator_unit_id']);
        }

        $this->actingAs($user)
            ->patchJson("/api/hospital/equipment/{$equipmentA->id}", [
                'hospital_id' => $hospitalB->id,
                'incubator_unit_id' => $unitB->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['hospital_id', 'incubator_unit_id']);
    }

    $this->assertDatabaseHas('hospital_equipment', [
        'id' => $equipmentA->id,
        'hospital_id' => $hospitalA->id,
        'incubator_unit_id' => $unitA->id,
    ]);
    $this->assertDatabaseHas('hospital_equipment', [
        'id' => $equipmentB->id,
        'hospital_id' => $hospitalB->id,
        'incubator_unit_id' => $unitB->id,
    ]);
});

test('equipment may be shared or individually tracked without conflating statuses', function () {
    [$hospital, $user] = createEquipmentHospital('Tracking Hospital');

    $this->actingAs($user)
        ->postJson('/api/hospital/equipment', validEquipmentPayload([
            'quantity' => 1,
            'tracking_mode' => 'individual',
            'asset_label' => 'MON-01',
            'operational_status' => 'operational',
            'availability_status' => 'in_use',
        ]))
        ->assertCreated()
        ->assertJsonPath('data.quantity', 1)
        ->assertJsonPath('data.operational_status', 'operational')
        ->assertJsonPath('data.availability_status', 'in_use');

    $this->assertDatabaseHas('hospital_equipment', [
        'hospital_id' => $hospital->id,
        'quantity' => 1,
        'operational_status' => 'operational',
        'availability_status' => 'in_use',
    ]);
});

test('equipment validation rejects invalid quantities, tracking modes, and status values', function () {
    [, $user] = createEquipmentHospital('Invalid Equipment Hospital');

    foreach ([
        ['quantity' => 0],
        ['quantity' => -2],
        ['tracking_mode' => 'bulk'],
        ['operational_status' => 'certified'],
        ['availability_status' => 'reserved_for_patient'],
        ['tracking_mode' => 'individual', 'quantity' => 2],
    ] as $invalid) {
        $this->actingAs($user)
            ->postJson('/api/hospital/equipment', validEquipmentPayload($invalid))
            ->assertUnprocessable();
    }

    $this->assertDatabaseCount('hospital_equipment', 0);

    $equipment = createEquipment($user->hospital);
    $this->actingAs($user)
        ->patchJson("/api/hospital/equipment/{$equipment->id}", [
            'tracking_mode' => 'individual',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['quantity']);
});

test('equipment timestamps are server controlled and only changed when availability is reported', function () {
    [, $user] = createEquipmentHospital('Timestamp Hospital');
    $this->actingAs($user)
        ->postJson('/api/hospital/equipment', validEquipmentPayload([
            'availability_reported_at' => '2000-01-01T00:00:00Z',
        ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['availability_reported_at']);

    $created = $this->actingAs($user)
        ->postJson('/api/hospital/equipment', validEquipmentPayload())
        ->assertCreated();
    $equipmentId = $created->json('data.id');
    $reportedAt = $created->json('data.availability_reported_at');
    expect($reportedAt)->not->toBe('2000-01-01T00:00:00Z');

    $this->travel(1)->minutes();
    $this->actingAs($user)
        ->patchJson("/api/hospital/equipment/{$equipmentId}", [
            'notes' => 'Changed internal note',
        ])
        ->assertOk()
        ->assertJsonPath('data.availability_reported_at', $reportedAt);

    $this->actingAs($user)
        ->patchJson("/api/hospital/equipment/{$equipmentId}", [
            'availability_status' => 'available',
            'availability_reported_at' => '2000-01-01T00:00:00Z',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['availability_reported_at']);

    $this->actingAs($user)
        ->patchJson("/api/hospital/equipment/{$equipmentId}", [
            'availability_status' => 'available',
        ])
        ->assertOk()
        ->assertJsonPath('data.availability_reported_at', fn ($value) => $value !== $reportedAt);
});

test('equipment routes reject guests inactive accounts and unauthorized roles', function () {
    [$hospital] = createEquipmentHospital('Route Protection Hospital');
    $equipment = createEquipment($hospital);
    $routes = [
        ['GET', '/api/hospital/equipment'],
        ['POST', '/api/hospital/equipment'],
        ['GET', "/api/hospital/equipment/{$equipment->id}"],
        ['PATCH', "/api/hospital/equipment/{$equipment->id}"],
        ['DELETE', "/api/hospital/equipment/{$equipment->id}"],
    ];

    foreach ($routes as [$method, $uri]) {
        $this->json($method, $uri, validEquipmentPayload())->assertUnauthorized();
    }

    $superAdmin = User::factory()->create();
    $superAdmin->forceFill(['role' => 'super_admin', 'status' => 'active'])->save();
    [, $inactiveHospitalUser] = createEquipmentHospital('Inactive Equipment User', 'hospital_admin', 'suspended');
    [, $invalidRoleUser] = createEquipmentHospital('Invalid Role Equipment User', 'customer', 'active');

    foreach ([$superAdmin, $inactiveHospitalUser, $invalidRoleUser] as $user) {
        foreach ($routes as [$method, $uri]) {
            $this->actingAs($user)
                ->json($method, $uri, validEquipmentPayload())
                ->assertForbidden();
        }
    }
});
