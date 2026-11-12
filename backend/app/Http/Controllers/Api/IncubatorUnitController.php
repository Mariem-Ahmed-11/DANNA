<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\IncubatorUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class IncubatorUnitController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => IncubatorUnit::query()
                ->where('hospital_id', $request->user()->hospital_id)
                ->latest('id')
                ->get(),
        ]);
    }

    public function show(Request $request, IncubatorUnit $incubatorUnit): JsonResponse
    {
        $this->ensureUnitBelongsToUser($request, $incubatorUnit);

        return response()->json(['data' => $incubatorUnit]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureHospitalAdmin($request);
        $validated = $this->validatedData($request);
        $unit = $request->user()->hospital->incubatorUnits()->create([
            ...$validated,
            'availability_updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Incubator availability record created.',
            'data' => $unit,
        ], 201);
    }

    public function update(Request $request, IncubatorUnit $incubatorUnit): JsonResponse
    {
        $this->ensureUnitBelongsToUser($request, $incubatorUnit);
        $validated = $this->validatedData($request, $incubatorUnit);
        if ($request->user()->role === 'hospital_staff') {
            $validated = array_intersect_key($validated, array_flip(['available_capacity']));
        }

        if (array_key_exists('available_capacity', $validated)
            && $validated['available_capacity'] !== (int) $incubatorUnit->available_capacity) {
            $validated['availability_updated_at'] = now();
        }

        $incubatorUnit->fill($validated)->save();

        return response()->json([
            'message' => 'Incubator availability record updated.',
            'data' => $incubatorUnit->refresh(),
        ]);
    }

    public function destroy(Request $request, IncubatorUnit $incubatorUnit): JsonResponse
    {
        $this->ensureUnitBelongsToUser($request, $incubatorUnit);
        $this->ensureHospitalAdmin($request);
        $incubatorUnit->delete();

        return response()->json(['message' => 'Incubator availability record deleted.']);
    }

    private function validatedData(Request $request, ?IncubatorUnit $unit = null): array
    {
        $isStaff = $request->user()->role === 'hospital_staff';
        $validator = Validator::make($request->all(), [
            'name' => $isStaff
                ? ['prohibited']
                : [$unit ? 'sometimes' : 'required', 'required', 'string', 'max:255'],
            'total_capacity' => $isStaff
                ? ['prohibited']
                : [$unit ? 'sometimes' : 'required', 'required', 'integer', 'min:0', 'max:4294967295'],
            'available_capacity' => [$unit ? 'sometimes' : 'required', 'required', 'integer', 'min:0', 'max:4294967295'],
            'price' => $isStaff
                ? ['prohibited']
                : [$unit ? 'sometimes' : 'required', 'required', 'numeric', 'decimal:0,2', 'min:0', 'max:99999999.99'],
            'hospital_id' => ['prohibited'],
            'availability_updated_at' => ['prohibited'],
        ]);

        $validator->after(function ($validator) use ($request, $unit, $isStaff): void {
            $total = $isStaff
                ? $unit?->total_capacity
                : $request->input('total_capacity', $unit?->total_capacity);
            $available = $request->input('available_capacity', $unit?->available_capacity);

            if (is_numeric($total) && is_numeric($available) && (int) $available > (int) $total) {
                $validator->errors()->add(
                    'available_capacity',
                    'Available capacity cannot exceed total capacity.'
                );
            }
        });

        $validated = $validator->validate();

        foreach (['total_capacity', 'available_capacity'] as $field) {
            if (array_key_exists($field, $validated)) {
                $validated[$field] = (int) $validated[$field];
            }
        }

        if (array_key_exists('price', $validated)) {
            $validated['price'] = number_format((float) $validated['price'], 2, '.', '');
        }

        return $validated;
    }

    private function ensureUnitBelongsToUser(Request $request, IncubatorUnit $unit): void
    {
        abort_unless($unit->hospital_id === $request->user()->hospital_id, 404);
    }

    private function ensureHospitalAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'hospital_admin', 403, 'This action is not authorized.');
    }
}
