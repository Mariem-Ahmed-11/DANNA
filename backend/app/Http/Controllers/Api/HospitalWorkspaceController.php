<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataReviewSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class HospitalWorkspaceController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $hospital = $request->user()->hospital;

        $capacity = $hospital->incubatorUnits()
            ->selectRaw('COUNT(*) as units')
            ->selectRaw('COALESCE(SUM(total_capacity), 0) as total_capacity')
            ->selectRaw('COALESCE(SUM(available_capacity), 0) as reported_available_capacity')
            ->first();

        $reviewCounts = DataReviewSubmission::query()
            ->where('hospital_id', $hospital->id)
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        return response()->json([
            'data' => [
                'hospital' => [
                    ...$hospital->only(['id', 'name']),
                    'logo_url' => $hospital->logo_path
                        ? Storage::disk('public')->url($hospital->logo_path)
                        : null,
                ],
                'hospital_status' => $hospital->status,
                'incubators' => [
                    'units' => (int) $capacity->units,
                    'total_capacity' => (int) $capacity->total_capacity,
                    'hospital_reported_available_capacity' => (int) $capacity->reported_available_capacity,
                ],
                'equipment' => [
                    'total' => $hospital->equipment()->count(),
                ],
                'medical_services' => [
                    'total' => $hospital->medicalServices()->count(),
                ],
                'staff' => [
                    'total' => $hospital->users()
                        ->where('role', 'hospital_staff')
                        ->count(),
                ],
                'data_reviews' => [
                    'pending' => (int) ($reviewCounts['pending_review'] ?? 0),
                    'approved' => (int) ($reviewCounts['approved_for_publication'] ?? 0),
                    'changes_requested' => (int) ($reviewCounts['changes_requested'] ?? 0),
                    'submissions' => DataReviewSubmission::query()
                        ->where('hospital_id', $hospital->id)
                        ->latest('submitted_at')
                        ->limit(5)
                        ->get(['id', 'target_type', 'status', 'submitted_at']),
                ],
            ],
        ]);
    }
}
