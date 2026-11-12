<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\HospitalStaffInvitationMail;
use App\Models\HospitalStaffInvitation;
use App\Models\User;
use App\Support\MailTransportSafety;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class HospitalStaffController extends Controller
{
    private const INVITATION_EXPIRY_MINUTES = 30;

    public function index(Request $request): JsonResponse
    {
        abort_unless(
            in_array($request->user()->role, ['hospital_admin', 'hospital_staff'], true),
            403,
            'Only hospital users can view their hospital staff.'
        );
        $isHospitalAdmin = $request->user()->role === 'hospital_admin';
        $hospital = $request->user()->hospital;

        return response()->json([
            'data' => [
                'staff' => $hospital->users()
                    ->where('role', 'hospital_staff')
                    ->orderBy('name')
                    ->get(['id', 'name', 'email', 'status', 'created_at']),
                'invitations' => $isHospitalAdmin ? $hospital->staffInvitations()
                    ->orderByDesc('created_at')
                    ->get(['id', 'name', 'email', 'expires_at', 'accepted_at', 'created_at'])
                    ->map(fn (object $invitation) => [
                        'id' => $invitation->id,
                        'name' => $invitation->name,
                        'email' => $invitation->email,
                        'status' => $invitation->accepted_at
                            ? 'accepted'
                            : (now()->greaterThan($invitation->expires_at) ? 'expired' : 'pending'),
                        'expires_at' => $invitation->expires_at,
                        'created_at' => $invitation->created_at,
                    ]) : [],
            ],
        ]);
    }

    public function invite(Request $request): JsonResponse
    {
        $this->ensureHospitalAdmin($request);

        if (MailTransportSafety::writesToLogs()) {
            return response()->json([
                'message' => 'Staff invitations cannot be sent until a non-logging mail transport is configured.',
            ], 503);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'role' => ['prohibited'],
            'hospital_id' => ['prohibited'],
        ]);
        $email = mb_strtolower($validated['email']);

        if (User::query()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            throw ValidationException::withMessages([
                'email' => ['This email address is already associated with an account.'],
            ]);
        }

        $invitationUrl = null;
        $expiresAt = now()->addMinutes(self::INVITATION_EXPIRY_MINUTES);

        $invitation = DB::transaction(function () use ($request, $validated, $email, $expiresAt, &$invitationUrl) {
            $invitation = HospitalStaffInvitation::query()
                ->where('email', $email)
                ->lockForUpdate()
                ->first();

            if ($invitation
                && $invitation->accepted_at === null
                && $invitation->token_hash !== null
                && $invitation->expires_at->isFuture()) {
                throw ValidationException::withMessages([
                    'email' => ['An active invitation already exists for this email address.'],
                ]);
            }

            $token = Str::random(64);
            $invitation ??= new HospitalStaffInvitation;
            $invitation->fill([
                'hospital_id' => $request->user()->hospital_id,
                'invited_by' => $request->user()->id,
                'name' => trim($validated['name']),
                'email' => $email,
                'token_hash' => hash('sha256', $token),
                'expires_at' => $expiresAt,
                'accepted_at' => null,
            ]);
            $invitation->save();

            $invitationUrl = rtrim(config('app.frontend_url'), '/')
                .'/accept-staff-invitation#token='.urlencode($token)
                .'&email='.urlencode($email);

            return $invitation;
        });

        try {
            Mail::to($email)->send(new HospitalStaffInvitationMail(
                inviteeName: $invitation->name,
                hospitalName: $request->user()->hospital->name,
                inviterName: $request->user()->name,
                invitationUrl: $invitationUrl,
                expiresInMinutes: self::INVITATION_EXPIRY_MINUTES,
            ));
        } catch (Throwable $exception) {
            Log::error('Staff invitation email could not be sent.', [
                'invitation_id' => $invitation->id,
                'email' => $email,
                'exception' => $exception::class,
            ]);

            return response()->json([
                'message' => 'The invitation was saved, but the email could not be sent. '
                    .'Contact DHANA support or restore mail delivery before trying again.',
            ], 503);
        }

        return response()->json([
            'message' => 'Staff invitation sent.',
            'data' => [
                'email' => $email,
                'expires_at' => $expiresAt,
            ],
        ], 201);
    }

    public function deactivate(Request $request, int $staffId): JsonResponse
    {
        $staff = $this->findStaff($request, $staffId);
        if ($staff->status !== 'active') {
            throw ValidationException::withMessages([
                'status' => ['Only active staff accounts can be deactivated.'],
            ]);
        }

        DB::transaction(fn () => $staff->forceFill(['status' => 'suspended'])->save());

        return response()->json(['message' => 'Staff account deactivated.']);
    }

    public function reactivate(Request $request, int $staffId): JsonResponse
    {
        $staff = $this->findStaff($request, $staffId);
        if ($staff->status !== 'suspended') {
            throw ValidationException::withMessages([
                'status' => ['Only deactivated staff accounts can be reactivated.'],
            ]);
        }

        DB::transaction(fn () => $staff->forceFill(['status' => 'active'])->save());

        return response()->json(['message' => 'Staff account reactivated.']);
    }

    public function acceptInvitation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'token' => ['required', 'string', 'size:64'],
            'password' => ['required', 'string', 'min:12', 'confirmed'],
        ]);
        $email = mb_strtolower($validated['email']);

        $user = DB::transaction(function () use ($validated, $email) {
            $invitation = HospitalStaffInvitation::query()
                ->where('email', $email)
                ->lockForUpdate()
                ->first();

            if (! $invitation
                || $invitation->accepted_at !== null
                || $invitation->token_hash === null
                || $invitation->expires_at->isPast()
                || ! hash_equals($invitation->token_hash, hash('sha256', $validated['token']))) {
                throw ValidationException::withMessages([
                    'invitation' => ['This invitation is invalid, expired, or has already been used.'],
                ]);
            }

            if (! $invitation->hospital()->where('status', 'approved')->exists()) {
                throw ValidationException::withMessages([
                    'invitation' => ['This hospital cannot currently accept staff invitations.'],
                ]);
            }

            if (User::query()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
                throw ValidationException::withMessages([
                    'email' => ['This email address is already associated with an account.'],
                ]);
            }

            $user = User::query()->create([
                'name' => $invitation->name,
                'email' => $invitation->email,
                'password' => $validated['password'],
            ]);
            $user->forceFill([
                'role' => 'hospital_staff',
                'status' => 'active',
                'hospital_id' => $invitation->hospital_id,
                'email_verified_at' => now(),
            ])->save();

            $invitation->forceFill([
                'accepted_at' => now(),
                'token_hash' => null,
            ])->save();

            return $user;
        });

        return response()->json([
            'message' => 'Invitation accepted. You can now sign in.',
            'user' => $user->only(['id', 'name', 'email', 'role', 'status', 'hospital_id']),
        ], 201);
    }

    private function ensureHospitalAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'hospital_admin', 403, 'Only hospital administrators can manage staff.');
    }

    private function findStaff(Request $request, int $staffId): User
    {
        $this->ensureHospitalAdmin($request);

        return User::query()
            ->where('hospital_id', $request->user()->hospital_id)
            ->where('role', 'hospital_staff')
            ->findOrFail($staffId);
    }
}
