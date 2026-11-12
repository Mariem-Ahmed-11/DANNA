<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HospitalEquipment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class HospitalEquipmentController extends Controller
{
    private const TRACKING_MODES = ['shared_quantity', 'individual'];

    private const OPERATIONAL_STATUSES = [
        'operational',
        'needs_maintenance',
        'out_of_service',
        'unknown',
    ];

    private const AVAILABILITY_STATUSES = [
        'available',
        'in_use',
        'unavailable',
        'unknown',
    ];

    public function index(Request $request): JsonResponse
    {
        $equipment = HospitalEquipment::query()
            ->where('hospital_id', $request->user()->hospital_id)
            ->with('incubatorUnit:id,name')
            ->latest('id')
            ->get();

        return response()->json(['data' => $equipment]);
    }

    public function show(Request $request, HospitalEquipment $equipment): JsonResponse
    {
        $this->ensureEquipmentBelongsToUser($request, $equipment);

        return response()->json(['data' => $equipment->load('incubatorUnit:id,name')]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureHospitalAdmin($request);
        $validated = $this->validatedData($request);
        $equipment = $request->user()->hospital->equipment()->create([
            ...$validated,
            'availability_reported_at' => now(),
        ]);

        return response()->json([
            'message' => 'Equipment record created.',
            'data' => $equipment->load('incubatorUnit:id,name'),
        ], 201);
    }

    public function update(Request $request, HospitalEquipment $equipment): JsonResponse
    {
        $this->ensureEquipmentBelongsToUser($request, $equipment);
        $validated = $this->validatedData($request, $equipment);
        if ($request->user()->role === 'hospital_staff') {
            $validated = array_intersect_key(
                $validated,
                array_flip(['operational_status', 'availability_status'])
            );
        }

        if (array_key_exists('availability_status', $validated)) {
            $validated['availability_reported_at'] = now();
        }

        $equipment->fill($validated)->save();

        return response()->json([
            'message' => 'Equipment record updated.',
            'data' => $equipment->refresh()->load('incubatorUnit:id,name'),
        ]);
    }

    public function destroy(Request $request, HospitalEquipment $equipment): JsonResponse
    {
        $this->ensureEquipmentBelongsToUser($request, $equipment);
        $this->ensureHospitalAdmin($request);
        $equipment->delete();

        return response()->json(['message' => 'Equipment record deleted.']);
    }

    private function validatedData(Request $request, ?HospitalEquipment $equipment = null): array
    {
        $hospitalId = $request->user()->hospital_id;
        $isStaff = $request->user()->role === 'hospital_staff';
        $validator = Validator::make($request->all(), [
            'incubator_unit_id' => $isStaff
                ? ['prohibited']
                : [
                    'sometimes',
                    'nullable',
                    'integer',
                    Rule::exists('incubator_units', 'id')->where('hospital_id', $hospitalId),
                ],
            'name' => $isStaff
                ? ['prohibited']
                : [$equipment ? 'sometimes' : 'required', 'required', 'string', 'max:255'],
            'quantity' => $isStaff
                ? ['prohibited']
                : [$equipment ? 'sometimes' : 'required', 'required', 'integer', 'min:1', 'max:4294967295'],
            'tracking_mode' => $isStaff
                ? ['prohibited']
                : [
                    $equipment ? 'sometimes' : 'required',
                    'required',
                    Rule::in(self::TRACKING_MODES),
                ],
            'asset_label' => $isStaff ? ['prohibited'] : ['sometimes', 'nullable', 'string', 'max:255'],
            'operational_status' => [
                $equipment ? 'sometimes' : 'required',
                'required',
                Rule::in(self::OPERATIONAL_STATUSES),
            ],
            'availability_status' => [
                $equipment ? 'sometimes' : 'required',
                'required',
                Rule::in(self::AVAILABILITY_STATUSES),
            ],
            'notes' => $isStaff ? ['prohibited'] : ['sometimes', 'nullable', 'string', 'max:5000'],
            'hospital_id' => ['prohibited'],
            'availability_reported_at' => ['prohibited'],
        ]);

        $validator->after(function ($validator) use ($request, $equipment, $isStaff): void {
            $trackingMode = $request->input('tracking_mode', $equipment?->tracking_mode);
            $quantity = $request->input('quantity', $equipment?->quantity);

            if ($trackingMode === 'individual' && is_numeric($quantity) && (int) $quantity !== 1) {
                $validator->errors()->add('quantity', 'Individually tracked equipment must have a quantity of 1.');
            }

            if ($isStaff
                && ! $request->exists('operational_status')
                && ! $request->exists('availability_status')) {
                $validator->errors()->add(
                    'operational_status',
                    'Update an operational or availability status.'
                );
            }
        });

        $validated = $validator->validate();

        if (array_key_exists('quantity', $validated)) {
            $validated['quantity'] = (int) $validated['quantity'];
        }

        return $validated;
    }

    private function ensureEquipmentBelongsToUser(Request $request, HospitalEquipment $equipment): void
    {
        abort_unless($equipment->hospital_id === $request->user()->hospital_id, 404);
    }

    private function ensureHospitalAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'hospital_admin', 403, 'This action is not authorized.');
    }
}
