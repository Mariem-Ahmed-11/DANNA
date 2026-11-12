<?php

use App\Models\Hospital;
use App\Models\IncubatorUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function createApprovedHospitalUser(string $hospitalName, string $role = 'hospital_admin'): array
{
    $hospital = Hospital::query()->create([
        'name' => $hospitalName,
        'city' => 'Springfield',
    ]);

    $user = $hospital->users()->create([
        'name' => "{$hospitalName} Staff",
        'email' => strtolower(str_replace(' ', '-', $hospitalName)).'@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $user->forceFill([
        'role' => $role,
        'status' => 'active',
    ])->save();
    $hospital->forceFill(['status' => 'approved'])->save();

    return [$hospital, $user];
}

function createIncubatorUnit(Hospital $hospital, string $name = 'NICU'): IncubatorUnit
{
    return $hospital->incubatorUnits()->create([
        'name' => $name,
        'total_capacity' => 12,
        'available_capacity' => 4,
        'price' => '750.00',
        'availability_updated_at' => now(),
    ]);
}

test('incubator unit routes reject guests and super admins', function () {
    [$hospital] = createApprovedHospitalUser('Protected Route Hospital');
    $unit = createIncubatorUnit($hospital);

    $this->getJson('/api/hospital/incubator-units')->assertUnauthorized();
    $this->getJson("/api/hospital/incubator-units/{$unit->id}")->assertUnauthorized();
    $this->patchJson("/api/hospital/incubator-units/{$unit->id}", ['name' => 'Unauthorized'])
        ->assertUnauthorized();
    $this->deleteJson("/api/hospital/incubator-units/{$unit->id}")->assertUnauthorized();

    $superAdmin = User::factory()->create();
    $this->actingAs($superAdmin)
        ->getJson('/api/hospital/incubator-units')
        ->assertForbidden();

    $this->actingAs($superAdmin)
        ->getJson("/api/hospital/incubator-units/{$unit->id}")
        ->assertForbidden();
    $this->actingAs($superAdmin)
        ->patchJson("/api/hospital/incubator-units/{$unit->id}", ['name' => 'Unauthorized'])
        ->assertForbidden();
    $this->actingAs($superAdmin)
        ->deleteJson("/api/hospital/incubator-units/{$unit->id}")
        ->assertForbidden();
});

test('hospital users can create units without choosing hospital ownership', function () {
    [$hospital, $user] = createApprovedHospitalUser('Hospital One');
    [$otherHospital] = createApprovedHospitalUser('Hospital Two');

    $this->actingAs($user)
        ->postJson('/api/hospital/incubator-units', [
            'name' => 'Neonatal Unit',
            'total_capacity' => 10,
            'available_capacity' => 3,
            'price' => '1250.50',
            'hospital_id' => $otherHospital->id,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['hospital_id']);

    $this->actingAs($user)
        ->postJson('/api/hospital/incubator-units', [
            'name' => 'Neonatal Unit',
            'total_capacity' => 10,
            'available_capacity' => 3,
            'price' => '1250.50',
        ])
        ->assertCreated()
        ->assertJsonPath('data.hospital_id', $hospital->id)
        ->assertJsonPath('data.total_capacity', 10)
        ->assertJsonPath('data.available_capacity', 3)
        ->assertJsonPath('data.price', '1250.50')
        ->assertJsonPath('data.availability_updated_at', fn ($value) => is_string($value));
});

test('capacity and price values are required and valid', function () {
    [, $user] = createApprovedHospitalUser('Validation Hospital');

    foreach ([
        ['total_capacity' => -1, 'available_capacity' => 0, 'price' => 10],
        ['total_capacity' => 2, 'available_capacity' => -1, 'price' => 10],
        ['total_capacity' => 2, 'available_capacity' => 3, 'price' => 10],
        ['total_capacity' => 'many', 'available_capacity' => 1, 'price' => 10],
        ['total_capacity' => 2, 'available_capacity' => 1, 'price' => -1],
        ['total_capacity' => 2, 'available_capacity' => 1, 'price' => 'invalid'],
        ['total_capacity' => 2, 'available_capacity' => 1, 'price' => '12.345'],
    ] as $values) {
        $this->actingAs($user)
            ->postJson('/api/hospital/incubator-units', [
                'name' => 'Invalid Unit',
                ...$values,
            ])
            ->assertUnprocessable();
    }

    $this->assertDatabaseCount('incubator_units', 0);
});

test('hospital users can update their own unit and availability timestamp changes only for availability', function () {
    [$hospital, $user] = createApprovedHospitalUser('Update Hospital');
    $unit = createIncubatorUnit($hospital);
    $oldTimestamp = $unit->availability_updated_at->toISOString();

    $this->actingAs($user)
        ->patchJson("/api/hospital/incubator-units/{$unit->id}", [
            'name' => 'Updated NICU',
            'price' => '1234.56',
        ])
        ->assertOk()
        ->assertJsonPath('data.name', 'Updated NICU')
        ->assertJsonPath('data.price', '1234.56')
        ->assertJsonPath('data.availability_updated_at', $oldTimestamp);

    $this->actingAs($user)
        ->patchJson("/api/hospital/incubator-units/{$unit->id}", [
            'available_capacity' => '4',
        ])
        ->assertOk()
        ->assertJsonPath('data.availability_updated_at', $oldTimestamp);

    $this->travel(1)->minutes();

    $response = $this->actingAs($user)
        ->patchJson("/api/hospital/incubator-units/{$unit->id}", [
            'available_capacity' => 5,
        ])
        ->assertOk()
        ->assertJsonPath('data.available_capacity', 5);

    expect($response->json('data.availability_updated_at'))->not->toBe($oldTimestamp)
        ->and($unit->fresh()->availability_updated_at->greaterThan($oldTimestamp))->toBeTrue();
});

test('hospital users cannot list, read, update, or delete another hospital units', function () {
    [$hospitalA, $userA] = createApprovedHospitalUser('Hospital A');
    $staffA = $hospitalA->users()->create([
        'name' => 'Hospital A Staff',
        'email' => 'hospital-a-staff@example.test',
        'password' => 'correct-horse-battery-staple',
    ]);
    $staffA->forceFill([
        'role' => 'hospital_staff',
        'status' => 'active',
    ])->save();
    [$hospitalB] = createApprovedHospitalUser('Hospital B');
    $unitA = createIncubatorUnit($hospitalA, 'A NICU');
    $unitB = createIncubatorUnit($hospitalB, 'B NICU');

    foreach ([$userA, $staffA] as $user) {
        $this->actingAs($user)
            ->getJson('/api/hospital/incubator-units')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $unitA->id);

        $this->actingAs($user)
            ->getJson("/api/hospital/incubator-units/{$unitB->id}")
            ->assertNotFound();

        $this->actingAs($user)
            ->patchJson("/api/hospital/incubator-units/{$unitB->id}", [
                'name' => 'Compromised',
            ])
            ->assertNotFound();

        $this->actingAs($user)
            ->deleteJson("/api/hospital/incubator-units/{$unitB->id}")
            ->assertNotFound();

        $this->actingAs($user)
            ->patchJson("/api/hospital/incubator-units/{$unitA->id}", [
                'hospital_id' => $hospitalB->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['hospital_id']);
    }

    $this->assertDatabaseHas('incubator_units', [
        'id' => $unitB->id,
        'name' => 'B NICU',
        'hospital_id' => $hospitalB->id,
    ]);
    $this->assertDatabaseHas('incubator_units', [
        'id' => $unitA->id,
        'hospital_id' => $hospitalA->id,
    ]);
});

test('hospital staff can only update reported capacity for their own units', function () {
    [$hospital, $staff] = createApprovedHospitalUser('Staff Hospital', 'hospital_staff');
    [$otherHospital] = createApprovedHospitalUser('Other Staff Hospital');
    $unit = createIncubatorUnit($hospital);
    $otherUnit = createIncubatorUnit($otherHospital, 'Other Hospital NICU');
    $originalTimestamp = $unit->availability_updated_at->toISOString();

    $this->actingAs($staff)
        ->getJson('/api/hospital/incubator-units')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $unit->id);

    $this->actingAs($staff)
        ->getJson("/api/hospital/incubator-units/{$unit->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $unit->id);

    $this->travel(1)->minutes();
    $updated = $this->actingAs($staff)
        ->patchJson("/api/hospital/incubator-units/{$unit->id}", [
            'available_capacity' => 6,
        ])
        ->assertOk()
        ->assertJsonPath('data.available_capacity', 6)
        ->assertJsonPath('data.total_capacity', 12)
        ->assertJsonPath('data.name', 'NICU');

    expect($updated->json('data.availability_updated_at'))->not->toBe($originalTimestamp);

    $this->actingAs($staff)
        ->patchJson("/api/hospital/incubator-units/{$unit->id}", [
            'available_capacity' => 13,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['available_capacity']);

    foreach ([
        ['name' => 'Changed unit'],
        ['total_capacity' => 20],
        ['price' => 0],
        ['hospital_id' => $otherHospital->id],
        ['availability_updated_at' => '2000-01-01T00:00:00Z'],
        ['available_capacity' => 7, 'total_capacity' => 20],
    ] as $restrictedPayload) {
        $this->actingAs($staff)
            ->patchJson("/api/hospital/incubator-units/{$unit->id}", $restrictedPayload)
            ->assertUnprocessable();
    }

    $this->actingAs($staff)
        ->postJson('/api/hospital/incubator-units', [
            'name' => 'Staff-created unit',
            'total_capacity' => 2,
            'available_capacity' => 1,
        ])
        ->assertForbidden();

    $this->actingAs($staff)
        ->deleteJson("/api/hospital/incubator-units/{$unit->id}")
        ->assertForbidden();

    $this->actingAs($staff)
        ->patchJson("/api/hospital/incubator-units/{$otherUnit->id}", [
            'available_capacity' => 1,
        ])
        ->assertNotFound();

    $this->assertDatabaseHas('incubator_units', [
        'id' => $unit->id,
        'name' => 'NICU',
        'total_capacity' => 12,
        'available_capacity' => 6,
        'hospital_id' => $hospital->id,
    ]);
    $this->assertDatabaseHas('incubator_units', [
        'id' => $otherUnit->id,
        'hospital_id' => $otherHospital->id,
        'available_capacity' => 4,
    ]);
});

test('unit update rejects capacities that are inconsistent with the existing record', function () {
    [$hospital, $user] = createApprovedHospitalUser('Capacity Update Hospital');
    $unit = createIncubatorUnit($hospital);

    $this->actingAs($user)
        ->patchJson("/api/hospital/incubator-units/{$unit->id}", [
            'total_capacity' => 2,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['available_capacity']);

    $this->assertDatabaseHas('incubator_units', [
        'id' => $unit->id,
        'total_capacity' => 12,
    ]);
});
