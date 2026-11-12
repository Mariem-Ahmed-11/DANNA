<?php

namespace App\Services;

use App\Models\Hospital;
use App\Models\HospitalLifecycleEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HospitalLifecycleService
{
    public function recordRegistration(Hospital $hospital): void
    {
        $this->recordEvent(
            hospital: $hospital,
            previousStatus: null,
            newStatus: 'pending_review',
            action: 'registration',
        );
    }

    public function approve(Hospital $hospital, User $actor): void
    {
        $this->transition(
            hospital: $hospital,
            expectedStatus: 'pending_review',
            newStatus: 'approved',
            action: 'approval',
            actor: $actor,
            callback: fn (Hospital $lockedHospital) => $lockedHospital->users()
                ->where('role', 'hospital_admin')
                ->where('status', 'pending')
                ->update(['status' => 'active']),
        );
    }

    public function reject(Hospital $hospital, User $actor, string $reason): void
    {
        $this->transition(
            hospital: $hospital,
            expectedStatus: 'pending_review',
            newStatus: 'rejected',
            action: 'rejection',
            actor: $actor,
            reason: $reason,
            callback: fn (Hospital $lockedHospital) => $lockedHospital->users()
                ->where('role', 'hospital_admin')
                ->where('status', 'pending')
                ->update(['status' => 'rejected']),
        );
    }

    public function suspend(Hospital $hospital, User $actor, string $reason): void
    {
        $this->transition(
            hospital: $hospital,
            expectedStatus: 'approved',
            newStatus: 'suspended',
            action: 'suspension',
            actor: $actor,
            reason: $reason,
            callback: function (Hospital $lockedHospital): array {
                $activeUserIds = $lockedHospital->users()
                    ->whereIn('role', ['hospital_admin', 'hospital_staff'])
                    ->where('status', 'active')
                    ->pluck('id')
                    ->map(fn ($id) => (int) $id)
                    ->all();

                if ($activeUserIds !== []) {
                    $lockedHospital->users()
                        ->whereIn('id', $activeUserIds)
                        ->whereIn('role', ['hospital_admin', 'hospital_staff'])
                        ->where('status', 'active')
                        ->update(['status' => 'suspended']);
                }

                return ['previously_active_user_ids' => $activeUserIds];
            },
        );
    }

    public function reactivate(Hospital $hospital, User $actor): void
    {
        $this->transition(
            hospital: $hospital,
            expectedStatus: 'suspended',
            newStatus: 'approved',
            action: 'reactivation',
            actor: $actor,
            callback: function (Hospital $lockedHospital): array {
                $suspension = $lockedHospital->lifecycleEvents()
                    ->where('action', 'suspension')
                    ->latest('id')
                    ->first();
                $activeUserIds = $suspension?->metadata['previously_active_user_ids'] ?? [];

                if ($activeUserIds !== []) {
                    $lockedHospital->users()
                        ->whereIn('id', $activeUserIds)
                        ->whereIn('role', ['hospital_admin', 'hospital_staff'])
                        ->where('status', 'suspended')
                        ->update(['status' => 'active']);
                }

                return ['restored_user_ids' => $activeUserIds];
            },
        );
    }

    public function resubmit(Hospital $hospital, User $actor): void
    {
        $this->transition(
            hospital: $hospital,
            expectedStatus: 'rejected',
            newStatus: 'pending_review',
            action: 'resubmission',
            actor: null,
            callback: function (Hospital $lockedHospital) use ($actor): void {
                $updated = $lockedHospital->users()
                    ->whereKey($actor->id)
                    ->where('role', 'hospital_admin')
                    ->where('status', 'rejected')
                    ->update(['status' => 'pending']);

                if ($updated !== 1) {
                    throw ValidationException::withMessages([
                        'account' => ['This hospital administrator cannot resubmit the registration.'],
                    ]);
                }
            },
            actorId: $actor->id,
        );
    }

    public function canAdminViewRestrictedStatus(User $user): bool
    {
        if ($user->role !== 'hospital_admin' || ! $user->hospital_id) {
            return false;
        }

        $hospital = $user->hospital;
        if ($hospital?->status === 'rejected') {
            return $user->status === 'rejected';
        }

        if ($hospital?->status !== 'suspended' || $user->status !== 'suspended') {
            return false;
        }

        $suspension = $hospital->lifecycleEvents()
            ->where('action', 'suspension')
            ->latest('id')
            ->first();

        return in_array($user->id, $suspension?->metadata['previously_active_user_ids'] ?? [], true);
    }

    private function transition(
        Hospital $hospital,
        string $expectedStatus,
        string $newStatus,
        string $action,
        ?User $actor,
        ?string $reason = null,
        ?callable $callback = null,
        ?int $actorId = null,
    ): void {
        DB::transaction(function () use (
            $hospital,
            $expectedStatus,
            $newStatus,
            $action,
            $actor,
            $reason,
            $callback,
            $actorId
        ): void {
            $lockedHospital = Hospital::query()
                ->whereKey($hospital->id)
                ->lockForUpdate()
                ->first();

            if (! $lockedHospital || $lockedHospital->status !== $expectedStatus) {
                throw ValidationException::withMessages([
                    'hospital' => ["Hospital must be {$expectedStatus} before this action."],
                ]);
            }

            $updated = Hospital::query()
                ->whereKey($lockedHospital->id)
                ->where('status', $expectedStatus)
                ->update([
                    'status' => $newStatus,
                    'updated_at' => now(),
                ]);

            if ($updated !== 1) {
                throw ValidationException::withMessages([
                    'hospital' => ['The hospital status changed before this action could be completed. Refresh and try again.'],
                ]);
            }

            $metadata = $callback ? $callback($lockedHospital) : null;

            $this->recordEvent(
                hospital: $lockedHospital,
                previousStatus: $expectedStatus,
                newStatus: $newStatus,
                action: $action,
                reason: $reason,
                actorId: $actor?->id ?? $actorId,
                metadata: is_array($metadata) ? $metadata : null,
            );
        });
    }

    private function recordEvent(
        Hospital $hospital,
        ?string $previousStatus,
        string $newStatus,
        string $action,
        ?string $reason = null,
        ?User $actor = null,
        ?array $metadata = null,
        ?int $actorId = null,
    ): void {
        HospitalLifecycleEvent::query()->create([
            'hospital_id' => $hospital->id,
            'previous_status' => $previousStatus,
            'new_status' => $newStatus,
            'action' => $action,
            'reason' => $reason,
            'actor_id' => $actor?->id ?? $actorId,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }
}
