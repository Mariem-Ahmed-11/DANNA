<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hospital;
use App\Models\User;
use App\Models\UserAccountStatusEvent;
use Illuminate\Http\JsonResponse;

class UserAccountStatusController extends Controller
{
    public function index(): JsonResponse
    {
        $users = User::query()
            ->whereIn('role', ['hospital_admin', 'hospital_staff'])
            ->whereNotNull('hospital_id')
            ->with('hospital:id,name,status')
            ->orderBy('name')
            ->get(['id', 'hospital_id', 'name', 'email', 'role', 'status']);

        return response()->json(['data' => $users]);
    }

    public function hospitalUsers(Hospital $hospital): JsonResponse
    {
        $users = $hospital->users()
            ->whereIn('role', ['hospital_admin', 'hospital_staff'])
            ->where('status', 'suspended')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role', 'status']);

        return response()->json(['data' => $users]);
    }

    public function hospitalAccounts(Hospital $hospital): JsonResponse
    {
        $users = $hospital->users()
            ->whereIn('role', ['hospital_admin', 'hospital_staff'])
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role', 'status']);

        return response()->json(['data' => $users]);
    }

    public function hospitalHistory(Hospital $hospital): JsonResponse
    {
        $events = UserAccountStatusEvent::query()
            ->where('hospital_id', $hospital->id)
            ->with(['user:id,name,email,role', 'actor:id,name'])
            ->orderBy('id')
            ->get()
            ->map(fn (UserAccountStatusEvent $event) => [
                'id' => $event->id,
                'user' => $event->user?->only(['id', 'name', 'email', 'role']),
                'user_id' => $event->user_id,
                'actor' => $event->actor?->only(['id', 'name']),
                'actor_id' => $event->actor_id,
                'previous_status' => $event->previous_status,
                'new_status' => $event->new_status,
                'action' => $event->action,
                'reason' => $event->reason,
                'created_at' => $event->created_at,
            ]);

        return response()->json(['data' => $events]);
    }
}
