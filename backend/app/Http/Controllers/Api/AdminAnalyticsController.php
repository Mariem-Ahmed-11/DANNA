<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataReviewSubmission;
use App\Models\Hospital;
use App\Models\HospitalEquipment;
use App\Models\IncubatorUnit;
use App\Models\MedicalService;
use Illuminate\Http\JsonResponse;

class AdminAnalyticsController extends Controller
{
    private const HOSPITAL_STATUSES = [
        'pending_review',
        'approved',
        'rejected',
        'suspended',
    ];

    private const REVIEW_STATUSES = [
        'pending_review',
        'approved_for_publication',
        'changes_requested',
    ];

    public function __invoke(): JsonResponse
    {
        $hospitalCounts = Hospital::query()
            ->select('status')
            ->selectRaw('COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($count) => (int) $count)
            ->all();

        $reviewCounts = DataReviewSubmission::query()
            ->select('status')
            ->selectRaw('COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($count) => (int) $count)
            ->all();

        $capacity = IncubatorUnit::query()
            ->selectRaw('COUNT(*) as units')
            ->selectRaw('COALESCE(SUM(total_capacity), 0) as total_capacity')
            ->selectRaw('COALESCE(SUM(available_capacity), 0) as reported_available_capacity')
            ->first();

        return response()->json([
            'data' => [
                'generated_at' => now()->toIso8601String(),
                'hospitals' => [
                    'total' => array_sum($hospitalCounts),
                    'by_status' => $this->countsWithKnownStatuses($hospitalCounts, self::HOSPITAL_STATUSES),
                ],
                'registration_requests' => [
                    'pending' => $hospitalCounts['pending_review'] ?? 0,
                ],
                'incubators' => [
                    'units' => (int) $capacity->units,
                    'total_capacity' => (int) $capacity->total_capacity,
                    'hospital_reported_available_capacity' => (int) $capacity->reported_available_capacity,
                ],
                'data_reviews' => [
                    'total' => array_sum($reviewCounts),
                    'by_status' => $this->countsWithKnownStatuses($reviewCounts, self::REVIEW_STATUSES),
                ],
                'equipment' => [
                    'total' => HospitalEquipment::query()->count(),
                ],
                'medical_services' => [
                    'total' => MedicalService::query()->count(),
                ],
            ],
        ]);
    }

    private function countsWithKnownStatuses(array $counts, array $knownStatuses): array
    {
        return array_replace(
            array_fill_keys($knownStatuses, 0),
            $counts,
        );
    }
}
