<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataReviewSubmission;
use App\Models\Hospital;
use App\Models\HospitalEquipment;
use App\Models\IncubatorUnit;
use App\Models\MedicalService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class DataReviewController extends Controller
{
    private const TARGET_TYPES = [
        'hospital_profile',
        'incubator_unit',
        'hospital_equipment',
        'medical_service',
    ];

    private const REVIEW_STATUSES = [
        'pending_review',
        'approved_for_publication',
        'changes_requested',
    ];

    public function hospitalIndex(Request $request): JsonResponse
    {
        $hospital = $request->user()->hospital;
        $records = $this->hospitalRecords($hospital);
        $submissions = DataReviewSubmission::query()
            ->where('hospital_id', $hospital->id)
            ->latest('submitted_at')
            ->latest('id')
            ->get()
            ->groupBy(fn (DataReviewSubmission $submission) => $this->targetKey(
                $submission->target_type,
                $submission->target_id
            ));

        return response()->json([
            'data' => collect($records)->map(function (array $record) use ($submissions) {
                $history = $submissions->get($this->targetKey(
                    $this->storedTargetType($record['target_type']),
                    $record['target_id']
                ), collect());
                $latest = $history->first();
                $versionMatches = $latest !== null
                    && hash_equals($latest->snapshot_hash, $this->snapshotHash($record['snapshot']));
                $reviewStatus = $latest?->status ?? 'not_submitted';
                if ($latest?->status === 'approved_for_publication' && ! $versionMatches) {
                    $reviewStatus = 'not_submitted';
                }

                return [
                    ...$record,
                    'review_status' => $reviewStatus,
                    'current_version_changed' => $latest !== null && ! $versionMatches,
                    'last_submitted_at' => $latest?->submitted_at,
                    'latest_feedback' => $latest?->feedback,
                    'history' => $history->map(fn (DataReviewSubmission $submission) => [
                        'status' => $submission->status,
                        'submitted_at' => $submission->submitted_at,
                        'reviewed_at' => $submission->reviewed_at,
                        'feedback' => $submission->feedback,
                    ])->values(),
                ];
            })->values(),
        ]);
    }

    public function submit(Request $request, string $type, int $recordId): JsonResponse
    {
        $this->validateSubmissionRequest($request);
        abort_unless(in_array($type, self::TARGET_TYPES, true), 404);

        $hospital = $request->user()->hospital;
        abort_if($type === 'hospital_profile' && $request->user()->role !== 'hospital_admin', 403);
        [$target, $snapshot] = $this->resolveTarget($hospital, $type, $recordId);
        $targetType = $this->storedTargetType($type);
        $snapshotHash = $this->snapshotHash($snapshot);

        try {
            $result = DB::transaction(function () use (
                $request,
                $hospital,
                $target,
                $targetType,
                $snapshot,
                $snapshotHash
            ) {
                $keyQuery = DataReviewSubmission::query()
                    ->where('hospital_id', $hospital->id)
                    ->where('target_type', $targetType)
                    ->where('target_id', $target->getKey());

                if ((clone $keyQuery)->where('status', 'pending_review')->exists()) {
                    return 'pending';
                }

                $latest = (clone $keyQuery)->latest('submitted_at')->latest('id')->first();
                if ($latest?->status === 'approved_for_publication'
                    && hash_equals($latest->snapshot_hash, $snapshotHash)) {
                    return 'unchanged';
                }

                return DataReviewSubmission::query()->create([
                    'hospital_id' => $hospital->id,
                    'target_type' => $targetType,
                    'target_id' => $target->getKey(),
                    'status' => 'pending_review',
                    'snapshot' => $snapshot,
                    'snapshot_hash' => $snapshotHash,
                    'submitted_by' => $request->user()->id,
                    'submitted_at' => now(),
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            return response()->json(['message' => 'This item already has a submission awaiting review.'], 409);
        }

        if ($result === 'pending') {
            return response()->json(['message' => 'This item already has a submission awaiting review.'], 409);
        }

        if ($result === 'unchanged') {
            return response()->json(['message' => 'This unchanged information is already approved for publication.'], 409);
        }

        return response()->json([
            'message' => 'Information submitted for DHANA review.',
            'data' => $this->submissionResponse($result),
        ], 201);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'hospital_id' => ['sometimes', 'integer', Rule::exists('hospitals', 'id')],
            'type' => ['sometimes', Rule::in(self::TARGET_TYPES)],
            'status' => ['sometimes', Rule::in(self::REVIEW_STATUSES)],
        ]);

        $submissions = DataReviewSubmission::query()
            ->with(['hospital:id,name,city', 'reviewer:id,name'])
            ->when(isset($validated['hospital_id']), fn ($query) => $query->where('hospital_id', $validated['hospital_id']))
            ->when(isset($validated['type']), fn ($query) => $query->where('target_type', $this->storedTargetType($validated['type'])))
            ->when(isset($validated['status']), fn ($query) => $query->where('status', $validated['status']))
            ->latest('submitted_at')
            ->get();

        return response()->json([
            'data' => $submissions->map(fn (DataReviewSubmission $submission) => $this->submissionResponse($submission)),
        ]);
    }

    public function adminShow(DataReviewSubmission $submission): JsonResponse
    {
        $history = DataReviewSubmission::query()
            ->where('hospital_id', $submission->hospital_id)
            ->where('target_type', $submission->target_type)
            ->where('target_id', $submission->target_id)
            ->with(['hospital:id,name,city', 'reviewer:id,name'])
            ->latest('submitted_at')
            ->get();

        return response()->json([
            'data' => [
                ...$this->submissionResponse($submission->load(['hospital:id,name,city', 'reviewer:id,name'])),
                'history' => $history->map(fn (DataReviewSubmission $item) => $this->submissionResponse($item)),
            ],
        ]);
    }

    public function approve(Request $request, DataReviewSubmission $submission): JsonResponse
    {
        $this->validateDecisionRequest($request);

        return $this->decide($request, $submission, 'approved_for_publication', null);
    }

    public function requestChanges(Request $request, DataReviewSubmission $submission): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'reason' => ['required', 'string', 'max:2000', 'regex:/\S/u'],
            ...$this->protectedMetadataRules(),
        ]);
        $validator->after(function ($validator) use ($request): void {
            $reason = $request->input('reason');
            if (is_string($reason) && mb_strlen($this->trimReason($reason)) < 5) {
                $validator->errors()->add('reason', 'The reason must contain at least 5 non-padding characters.');
            }
        });
        $validated = $validator->validate();

        return $this->decide(
            $request,
            $submission,
            'changes_requested',
            $this->trimReason($validated['reason'])
        );
    }

    private function trimReason(string $reason): string
    {
        return preg_replace('/^[\p{Z}\s]+|[\p{Z}\s]+$/u', '', $reason) ?? '';
    }

    private function validateDecisionRequest(Request $request): void
    {
        Validator::make($request->all(), [
            ...$this->protectedMetadataRules(),
            'reason' => ['prohibited'],
        ])->validate();
    }

    private function protectedMetadataRules(): array
    {
        return [
            'hospital_id' => ['prohibited'],
            'reviewer_id' => ['prohibited'],
            'reviewed_by' => ['prohibited'],
            'submitted_by' => ['prohibited'],
            'target_type' => ['prohibited'],
            'target_id' => ['prohibited'],
            'status' => ['prohibited'],
            'review_status' => ['prohibited'],
            'reviewed_at' => ['prohibited'],
            'submitted_at' => ['prohibited'],
            'snapshot' => ['prohibited'],
            'snapshot_hash' => ['prohibited'],
            'feedback' => ['prohibited'],
        ];
    }

    private function decide(
        Request $request,
        DataReviewSubmission $submission,
        string $status,
        ?string $feedback
    ): JsonResponse {
        $decision = DB::transaction(function () use ($request, $submission, $status, $feedback): string {
            $lockedSubmission = DataReviewSubmission::query()
                ->lockForUpdate()
                ->findOrFail($submission->id);
            if ($lockedSubmission->status !== 'pending_review') {
                return 'already_decided';
            }

            if ($status === 'approved_for_publication') {
                [$target, $currentSnapshot] = $this->resolveTarget(
                    $lockedSubmission->hospital,
                    $this->routeTargetType($lockedSubmission->target_type),
                    $lockedSubmission->target_id,
                    true
                );
                if ($target === null) {
                    return 'missing';
                }
                if (! hash_equals($lockedSubmission->snapshot_hash, $this->snapshotHash($currentSnapshot))) {
                    return 'stale';
                }
            }

            $lockedSubmission->forceFill([
                'status' => $status,
                'feedback' => $feedback,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ])->save();

            return 'saved';
        });

        if ($decision !== 'saved') {
            $message = match ($decision) {
                'stale' => 'The hospital information changed after submission. Request changes so the hospital can submit the updated version.',
                'missing' => 'The submitted hospital record no longer exists and cannot be approved.',
                default => 'Only submissions awaiting review can be decided.',
            };

            return response()->json(['message' => $message], 409);
        }

        return response()->json([
            'message' => $status === 'approved_for_publication'
                ? 'Information approved for possible publication.'
                : 'Changes requested from the hospital.',
            'data' => $this->submissionResponse($submission->refresh()->load(['hospital:id,name,city', 'reviewer:id,name'])),
        ]);
    }

    private function hospitalRecords(Hospital $hospital): array
    {
        $records = [[
            'target_type' => 'hospital_profile',
            'target_id' => $hospital->id,
            'title' => 'Hospital profile',
            'snapshot' => $this->profileSnapshot($hospital),
        ]];

        foreach ($hospital->incubatorUnits()->latest('id')->get() as $unit) {
            $records[] = [
                'target_type' => 'incubator_unit',
                'target_id' => $unit->id,
                'title' => $unit->name,
                'snapshot' => $this->unitSnapshot($unit),
            ];
        }

        foreach ($hospital->equipment()->with('incubatorUnit:id,name')->latest('id')->get() as $equipment) {
            $records[] = [
                'target_type' => 'hospital_equipment',
                'target_id' => $equipment->id,
                'title' => $equipment->name,
                'snapshot' => $this->equipmentSnapshot($equipment),
            ];
        }

        foreach ($hospital->medicalServices()->latest('id')->get() as $service) {
            $records[] = [
                'target_type' => 'medical_service',
                'target_id' => $service->id,
                'title' => $service->name,
                'snapshot' => $this->serviceSnapshot($service),
            ];
        }

        return $records;
    }

    private function resolveTarget(Hospital $hospital, string $type, int $recordId, bool $forUpdate = false): array
    {
        $findOwned = function ($relation) use ($recordId, $forUpdate) {
            $query = $relation->whereKey($recordId);
            if ($forUpdate) {
                $query->lockForUpdate();
            }

            return $query->first();
        };

        $target = match ($type) {
            'hospital_profile' => $recordId === $hospital->id
                ? $findOwned(Hospital::query())
                : null,
            'incubator_unit' => $findOwned($hospital->incubatorUnits()),
            'hospital_equipment' => $findOwned($hospital->equipment()->with('incubatorUnit:id,name')),
            'medical_service' => $findOwned($hospital->medicalServices()),
            default => null,
        };
        if ($target === null && $forUpdate) {
            return [null, null];
        }
        abort_if($target === null, 404);

        $snapshot = match ($type) {
            'hospital_profile' => $this->profileSnapshot($target),
            'incubator_unit' => $this->unitSnapshot($target),
            'hospital_equipment' => $this->equipmentSnapshot($target),
            'medical_service' => $this->serviceSnapshot($target),
        };

        return [$target, $snapshot];
    }

    private function profileSnapshot(Hospital $hospital): array
    {
        return [
            'name' => $hospital->name,
            'city' => $hospital->city,
            'governorate' => $hospital->governorate,
            'address' => $hospital->address,
            'phone' => $hospital->phone,
            'contact_email' => $hospital->contact_email,
            'short_description' => $hospital->short_description,
            'overview' => $hospital->overview,
            'website_url' => $hospital->website_url,
            'working_hours' => $hospital->working_hours,
            'establishment_year' => $hospital->establishment_year,
            'location_url' => $hospital->location_url,
            'specialties' => $hospital->specialties,
            'services' => $hospital->services,
            'logo_url' => $hospital->logo_path ? Storage::disk('public')->url($hospital->logo_path) : null,
        ];
    }

    private function unitSnapshot(IncubatorUnit $unit): array
    {
        return [
            'name' => $unit->name,
            'total_capacity' => $unit->total_capacity,
            'hospital_reported_available_capacity' => $unit->available_capacity,
            'availability_last_reported_at' => $unit->availability_updated_at,
        ];
    }

    private function equipmentSnapshot(HospitalEquipment $equipment): array
    {
        return [
            'name' => $equipment->name,
            'quantity' => $equipment->quantity,
            'tracking_mode' => $equipment->tracking_mode,
            'asset_label' => $equipment->asset_label,
            'incubator_unit' => $equipment->incubatorUnit?->name,
            'operational_status' => $equipment->operational_status,
            'hospital_reported_availability_status' => $equipment->availability_status,
            'availability_last_reported_at' => $equipment->availability_reported_at,
        ];
    }

    private function serviceSnapshot(MedicalService $service): array
    {
        return [
            'name' => $service->name,
            'category' => $service->category,
            'short_description' => $service->short_description,
            'detailed_description' => $service->detailed_description,
            'service_status' => $service->service_status,
            'operating_hours' => $service->operating_hours,
        ];
    }

    private function validateSubmissionRequest(Request $request): void
    {
        Validator::make($request->all(), [
            'hospital_id' => ['prohibited'],
            'reviewer_id' => ['prohibited'],
            'reviewed_by' => ['prohibited'],
            'submitted_by' => ['prohibited'],
            'target_type' => ['prohibited'],
            'target_id' => ['prohibited'],
            'status' => ['prohibited'],
            'review_status' => ['prohibited'],
            'reviewed_at' => ['prohibited'],
            'submitted_at' => ['prohibited'],
            'snapshot' => ['prohibited'],
            'snapshot_hash' => ['prohibited'],
            'feedback' => ['prohibited'],
        ])->validate();
    }

    private function submissionResponse(DataReviewSubmission $submission): array
    {
        return [
            'id' => $submission->id,
            'hospital_id' => $submission->hospital_id,
            'hospital_name' => $submission->hospital?->name,
            'hospital_city' => $submission->hospital?->city,
            'target_type' => $this->routeTargetType($submission->target_type),
            'target_id' => $submission->target_id,
            'status' => $submission->status,
            'snapshot' => $submission->snapshot,
            'submitted_at' => $submission->submitted_at,
            'reviewed_at' => $submission->reviewed_at,
            'reviewer_name' => $submission->reviewer?->name,
            'feedback' => $submission->feedback,
        ];
    }

    private function snapshotHash(array $snapshot): string
    {
        return hash('sha256', json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    private function targetKey(string $type, int $id): string
    {
        return "{$type}:{$id}";
    }

    private function storedTargetType(string $type): string
    {
        return match ($type) {
            'hospital_profile' => Hospital::class,
            'incubator_unit' => IncubatorUnit::class,
            'hospital_equipment' => HospitalEquipment::class,
            'medical_service' => MedicalService::class,
            default => $type,
        };
    }

    private function routeTargetType(string $storedType): string
    {
        return match ($storedType) {
            Hospital::class => 'hospital_profile',
            IncubatorUnit::class => 'incubator_unit',
            HospitalEquipment::class => 'hospital_equipment',
            MedicalService::class => 'medical_service',
            default => $storedType,
        };
    }
}
