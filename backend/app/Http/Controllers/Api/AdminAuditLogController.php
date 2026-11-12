<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminAuditLogController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['nullable', 'in:hospital,account'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $hospitalEvents = DB::table('hospital_lifecycle_events as events')
            ->join('hospitals', 'hospitals.id', '=', 'events.hospital_id')
            ->leftJoin('users as actors', 'actors.id', '=', 'events.actor_id')
            ->selectRaw("'hospital' as event_type")
            ->addSelect([
                'events.id as event_id',
                'events.action',
                'events.previous_status',
                'events.new_status',
                'events.reason',
                'events.created_at',
                'actors.name as actor_name',
                'hospitals.name as subject_name',
                'hospitals.name as hospital_name',
            ]);

        $accountEvents = DB::table('user_account_status_events as events')
            ->join('users as subjects', 'subjects.id', '=', 'events.user_id')
            ->join('hospitals', 'hospitals.id', '=', 'events.hospital_id')
            ->leftJoin('users as actors', 'actors.id', '=', 'events.actor_id')
            ->selectRaw("'account' as event_type")
            ->addSelect([
                'events.id as event_id',
                'events.action',
                'events.previous_status',
                'events.new_status',
                'events.reason',
                'events.created_at',
                'actors.name as actor_name',
                'subjects.name as subject_name',
                'hospitals.name as hospital_name',
            ]);

        $events = $hospitalEvents->unionAll($accountEvents);
        $query = DB::query()->fromSub($events, 'audit_events');

        $eventType = $validated['type'] ?? null;
        if (in_array($eventType, ['hospital', 'account'], true)) {
            $query->where('event_type', $eventType);
        }

        $search = trim((string) ($validated['search'] ?? ''));
        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('actor_name', 'like', "%{$search}%")
                    ->orWhere('subject_name', 'like', "%{$search}%")
                    ->orWhere('hospital_name', 'like', "%{$search}%")
                    ->orWhere('action', 'like', "%{$search}%")
                    ->orWhere('reason', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query
                ->orderByDesc('created_at')
                ->orderByDesc('event_id')
                ->orderBy('event_type')
                ->paginate(25)
                ->withQueryString()
        );
    }
}
