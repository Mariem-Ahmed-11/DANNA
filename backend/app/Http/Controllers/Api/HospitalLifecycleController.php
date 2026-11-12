<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hospital;
use Illuminate\Http\JsonResponse;

class HospitalLifecycleController extends Controller
{
    public function history(Hospital $hospital): JsonResponse
    {
        return response()->json([
            'data' => $hospital->lifecycleEvents()
                ->with('actor:id,name')
                ->orderBy('id')
                ->get()
                ->map(fn ($event) => [
                    'id' => $event->id,
                    'previous_status' => $event->previous_status,
                    'new_status' => $event->new_status,
                    'action' => $event->action,
                    'reason' => $event->reason,
                    'actor' => $event->actor?->only(['id', 'name']),
                    'actor_id' => $event->actor_id,
                    'created_at' => $event->created_at,
                ]),
        ]);
    }
}
