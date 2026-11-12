<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MedicalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class MedicalServiceController extends Controller
{
    private const CATEGORIES = [
        'Neonatal Care',
        'Neonatal Intensive Care',
        'Incubator Care',
        'Premature Infant Care',
        'Pediatric Consultation',
        'Neonatal Monitoring',
        'Other',
    ];

    private const STATUSES = [
        'offered',
        'temporarily_unavailable',
        'not_confirmed',
    ];

    public function index(Request $request): JsonResponse
    {
        $services = MedicalService::query()
            ->where('hospital_id', $request->user()->hospital_id)
            ->latest('id')
            ->get();

        return response()->json(['data' => $services]);
    }

    public function show(Request $request, MedicalService $medicalService): JsonResponse
    {
        $this->ensureServiceBelongsToUser($request, $medicalService);

        return response()->json(['data' => $medicalService]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureHospitalAdmin($request);
        $validated = $this->validatedData($request);
        $service = $request->user()->hospital->medicalServices()->create($validated);

        return response()->json([
            'message' => 'Medical service created.',
            'data' => $service,
        ], 201);
    }

    public function update(Request $request, MedicalService $medicalService): JsonResponse
    {
        $this->ensureServiceBelongsToUser($request, $medicalService);
        $this->ensureHospitalAdmin($request);
        $validated = $this->validatedData($request, $medicalService);

        $medicalService->fill($validated)->save();

        return response()->json([
            'message' => 'Medical service updated.',
            'data' => $medicalService->refresh(),
        ]);
    }

    public function destroy(Request $request, MedicalService $medicalService): JsonResponse
    {
        $this->ensureServiceBelongsToUser($request, $medicalService);
        $this->ensureHospitalAdmin($request);
        $medicalService->delete();

        return response()->json(['message' => 'Medical service deleted.']);
    }

    private function validatedData(Request $request, ?MedicalService $medicalService = null): array
    {
        $validator = Validator::make($request->all(), [
            'name' => [$medicalService ? 'sometimes' : 'required', 'string', 'max:255'],
            'category' => [
                $medicalService ? 'sometimes' : 'required',
                'required',
                Rule::in(self::CATEGORIES),
            ],
            'short_description' => [$medicalService ? 'sometimes' : 'required', 'required', 'string', 'max:500'],
            'detailed_description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'service_status' => [
                $medicalService ? 'sometimes' : 'required',
                'required',
                Rule::in(self::STATUSES),
            ],
            'operating_hours' => ['sometimes', 'nullable', 'string', 'max:255'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'hospital_id' => ['prohibited'],
        ]);

        return $validator->validate();
    }

    private function ensureServiceBelongsToUser(Request $request, MedicalService $medicalService): void
    {
        abort_unless($medicalService->hospital_id === $request->user()->hospital_id, 404);
    }

    private function ensureHospitalAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'hospital_admin', 403, 'This action is not authorized.');
    }
}
