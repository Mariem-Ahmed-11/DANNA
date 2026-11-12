<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hospital;
use App\Models\User;
use App\Models\UserAccountStatusEvent;
use App\Services\HospitalLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class HospitalController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $hospitals = Hospital::query()
            ->when($user->role !== 'super_admin', fn ($query) => $query->whereKey($user->hospital_id))
            ->latest('id')
            ->get();

        return response()->json(['data' => $hospitals]);
    }

    public function show(Request $request, Hospital $hospital): JsonResponse
    {
        abort_unless(
            $request->user()->role === 'super_admin'
                || $request->user()->hospital_id === $hospital->id,
            404
        );

        return response()->json(['data' => $hospital]);
    }

    public function register(Request $request, HospitalLifecycleService $lifecycle): JsonResponse
    {
        $this->normalizeProfileArrays($request);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            ...$this->profileValidationRules(),
            'contact_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:12', 'confirmed'],
        ]);

        $logoPath = $this->storeLogo($request);

        try {
            $registration = DB::transaction(function () use ($validated, $logoPath, $lifecycle) {
                $hospitalData = [
                    'name' => $validated['name'],
                    'city' => $validated['city'],
                    'phone' => $validated['phone'] ?? null,
                    ...$this->profileData($validated),
                ];
                $hospital = Hospital::query()->create($hospitalData);
                if ($logoPath !== null) {
                    $hospital->forceFill(['logo_path' => $logoPath])->save();
                }

                $user = $hospital->users()->create([
                    'name' => $validated['contact_name'],
                    'email' => mb_strtolower($validated['email']),
                    'password' => $validated['password'],
                ]);
                $user->forceFill([
                    'role' => 'hospital_admin',
                    'status' => 'pending',
                ])->save();
                $lifecycle->recordRegistration($hospital);

                return $hospital->refresh();
            });
        } catch (Throwable $exception) {
            if ($logoPath !== null) {
                Storage::disk('public')->delete($logoPath);
            }
            throw $exception;
        }

        return response()->json([
            'message' => 'Hospital registration submitted for review.',
            'data' => [
                'id' => $registration->id,
                'name' => $registration->name,
                'status' => $registration->status,
            ],
        ], 201);
    }

    public function update(Request $request, Hospital $hospital): JsonResponse
    {
        abort_unless(
            $request->user()->role === 'super_admin'
                || ($request->user()->role === 'hospital_admin'
                    && $request->user()->hospital_id === $hospital->id),
            404
        );

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'city' => ['sometimes', 'required', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);

        $hospital->fill($validated)->save();

        return response()->json([
            'message' => 'Hospital information updated.',
            'data' => $hospital->refresh(),
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        abort_unless(
            in_array($request->user()->role, ['hospital_admin', 'hospital_staff'], true),
            403
        );
        $hospital = $request->user()->hospital;

        return response()->json(['data' => $this->profileResponse($hospital)]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $this->ensureHospitalAdmin($request);
        $hospital = $request->user()->hospital;
        $this->normalizeProfileArrays($request);
        $validated = $request->validate([
            ...$this->profileValidationRules(),
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'city' => ['sometimes', 'required', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'remove_logo' => ['sometimes', 'boolean'],
        ]);

        return $this->saveProfile($request, $hospital, $validated);
    }

    public function rejectedRegistrationStatus(
        Request $request,
        HospitalLifecycleService $lifecycle
    ): JsonResponse {
        $this->ensureRestrictedHospitalAdmin($request, $lifecycle);
        $hospital = $request->user()->hospital;
        $action = $hospital->status === 'rejected' ? 'rejection' : 'suspension';
        $decision = $hospital->lifecycleEvents()->where('action', $action)->latest('id')->first();

        return response()->json([
            'data' => [
                'status' => $hospital->status,
                'decision' => $decision ? [
                    'action' => $decision->action,
                    'reason' => $decision->reason,
                    'created_at' => $decision->created_at,
                ] : null,
                'can_resubmit' => $hospital->status === 'rejected',
                'hospital_name' => $hospital->name,
            ],
        ]);
    }

    public function rejectedRegistrationProfile(Request $request): JsonResponse
    {
        $this->ensureRejectedHospitalAdmin($request);

        return response()->json([
            'data' => $this->profileResponse($request->user()->hospital),
        ]);
    }

    public function updateRejectedRegistrationProfile(Request $request): JsonResponse
    {
        $this->ensureRejectedHospitalAdmin($request);
        $hospital = $request->user()->hospital;
        $this->normalizeProfileArrays($request);
        $validated = $request->validate([
            ...$this->profileValidationRules(),
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'city' => ['sometimes', 'required', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'remove_logo' => ['sometimes', 'boolean'],
        ]);

        return $this->saveProfile($request, $hospital, $validated);
    }

    public function resubmitRejectedRegistration(
        Request $request,
        HospitalLifecycleService $lifecycle
    ): JsonResponse {
        $this->ensureRejectedHospitalAdmin($request);
        $hospital = $request->user()->hospital;
        $lifecycle->resubmit($hospital, $request->user());

        return response()->json([
            'message' => 'Hospital registration resubmitted for review.',
            'data' => [
                'id' => $hospital->id,
                'status' => 'pending_review',
            ],
        ]);
    }

    private function saveProfile(Request $request, Hospital $hospital, array $validated): JsonResponse
    {
        $oldLogoPath = $hospital->logo_path;
        $newLogoPath = $this->storeLogo($request);
        try {
            $hospital->fill([
                ...array_intersect_key($validated, array_flip(['name', 'city', 'phone'])),
                ...$this->profileData($validated),
            ]);
            if ($newLogoPath !== null) {
                $hospital->forceFill(['logo_path' => $newLogoPath]);
            } elseif (! empty($validated['remove_logo'])) {
                $hospital->forceFill(['logo_path' => null]);
            }
            $hospital->save();
        } catch (Throwable $exception) {
            if ($newLogoPath !== null) {
                Storage::disk('public')->delete($newLogoPath);
            }
            throw $exception;
        }

        if ($oldLogoPath !== null && ($newLogoPath !== null || ! empty($validated['remove_logo']))) {
            Storage::disk('public')->delete($oldLogoPath);
        }

        return response()->json([
            'message' => 'Hospital profile updated.',
            'data' => $this->profileResponse($hospital->refresh()),
        ]);
    }

    private function profileValidationRules(): array
    {
        return [
            'contact_email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'governorate' => ['sometimes', 'nullable', 'string', 'max:100'],
            'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'short_description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'overview' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'website_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'working_hours' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'establishment_year' => [
                'sometimes',
                'nullable',
                'integer',
                'min:1800',
                'max:'.now()->year,
            ],
            'location_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'specialties' => ['sometimes', 'nullable', 'array', 'max:20'],
            'specialties.*' => ['string', 'max:100'],
            'services' => ['sometimes', 'nullable', 'array', 'max:30'],
            'services.*' => ['string', 'max:150'],
            'logo' => ['sometimes', 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ];
    }

    private function profileData(array $validated): array
    {
        return array_intersect_key($validated, array_flip([
            'contact_email',
            'governorate',
            'address',
            'short_description',
            'overview',
            'website_url',
            'working_hours',
            'establishment_year',
            'location_url',
            'specialties',
            'services',
        ]));
    }

    private function normalizeProfileArrays(Request $request): void
    {
        foreach (['specialties', 'services'] as $field) {
            $value = $request->input($field);
            if (is_string($value)) {
                $decoded = json_decode($value, true);
                if (is_array($decoded)) {
                    $request->merge([$field => $decoded]);
                }
            }
        }
    }

    private function storeLogo(Request $request): ?string
    {
        if (! $request->hasFile('logo')) {
            return null;
        }

        $path = $request->file('logo')->store('hospital-logos', 'public');
        if (! is_string($path)) {
            throw new \RuntimeException('The hospital profile image could not be stored.');
        }

        return $path;
    }

    private function profileResponse(Hospital $hospital): array
    {
        $profileFields = [
            'name',
            'phone',
            'contact_email',
            'governorate',
            'city',
            'address',
            'short_description',
            'overview',
            'website_url',
            'working_hours',
            'establishment_year',
            'location_url',
            'specialties',
            'services',
        ];
        $completionFields = [
            'contact_email',
            'governorate',
            'address',
            'short_description',
            'overview',
            'logo_path',
            'website_url',
            'working_hours',
            'establishment_year',
            'location_url',
            'specialties',
            'services',
        ];
        $completedFields = collect($completionFields)
            ->filter(fn (string $field) => filled($hospital->{$field}))
            ->count();

        return [
            ...$hospital->only($profileFields),
            'id' => $hospital->id,
            'logo_url' => $hospital->logo_path
                ? Storage::disk('public')->url($hospital->logo_path)
                : null,
            'profile_completion' => [
                'completed' => $completedFields,
                'total' => count($completionFields),
                'percentage' => (int) round($completedFields / count($completionFields) * 100),
            ],
        ];
    }

    private function ensureHospitalAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'hospital_admin', 403);
    }

    public function requests(): JsonResponse
    {
        return response()->json([
            'data' => Hospital::query()
                ->where('status', 'pending_review')
                ->with('users:id,hospital_id,name,email')
                ->latest('id')
                ->get(),
        ]);
    }

    public function approve(
        Request $request,
        Hospital $hospital,
        HospitalLifecycleService $lifecycle
    ): JsonResponse {
        $lifecycle->approve($hospital, $request->user());

        return response()->json([
            'message' => 'Hospital registration approved.',
            'data' => $hospital->refresh(),
        ]);
    }

    public function reject(
        Request $request,
        Hospital $hospital,
        HospitalLifecycleService $lifecycle
    ): JsonResponse {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
        ]);
        $lifecycle->reject($hospital, $request->user(), trim($validated['reason']));

        return response()->json([
            'message' => 'Hospital registration rejected.',
            'data' => $hospital->refresh(),
        ]);
    }

    public function suspend(
        Request $request,
        Hospital $hospital,
        HospitalLifecycleService $lifecycle
    ): JsonResponse {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
        ]);
        $lifecycle->suspend($hospital, $request->user(), trim($validated['reason']));

        return response()->json([
            'message' => 'Hospital account suspended.',
            'data' => $hospital->refresh(),
        ]);
    }

    public function reactivate(
        Request $request,
        Hospital $hospital,
        HospitalLifecycleService $lifecycle
    ): JsonResponse {
        $lifecycle->reactivate($hospital, $request->user());

        return response()->json([
            'message' => 'Hospital account reactivated.',
            'data' => $hospital->refresh(),
        ]);
    }

    public function activateUser(
        Request $request,
        Hospital $hospital,
        User $user
    ): JsonResponse {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
        ]);

        if ($hospital->status !== 'approved') {
            throw ValidationException::withMessages([
                'hospital' => ['The hospital must be approved before its users can be manually activated.'],
            ]);
        }

        if ($user->hospital_id !== $hospital->id) {
            abort(404);
        }

        if (! in_array($user->role, ['hospital_admin', 'hospital_staff'], true)) {
            throw ValidationException::withMessages([
                'user' => ['Only hospital_admin and hospital_staff accounts can be activated through this endpoint.'],
            ]);
        }

        if ($user->status !== 'suspended') {
            throw ValidationException::withMessages([
                'user' => ['Only suspended accounts can be activated.'],
            ]);
        }

        DB::transaction(function () use ($request, $hospital, $user, $validated): void {
            $updated = User::query()
                ->whereKey($user->id)
                ->where('hospital_id', $hospital->id)
                ->whereIn('role', ['hospital_admin', 'hospital_staff'])
                ->where('status', 'suspended')
                ->update(['status' => 'active']);

            if ($updated !== 1) {
                throw ValidationException::withMessages([
                    'user' => ['The account status changed before this action could be completed.'],
                ]);
            }

            UserAccountStatusEvent::query()->create([
                'user_id' => $user->id,
                'hospital_id' => $hospital->id,
                'actor_id' => $request->user()->id,
                'previous_status' => 'suspended',
                'new_status' => 'active',
                'action' => 'manual_activation',
                'reason' => trim($validated['reason']),
                'created_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'User account activated.',
            'data' => [
                'id' => $user->id,
                'name' => $user->fresh()->name,
                'email' => $user->fresh()->email,
                'role' => $user->fresh()->role,
                'status' => $user->fresh()->status,
            ],
        ]);
    }

    private function ensureRejectedHospitalAdmin(Request $request): void
    {
        abort_unless(
            $request->user()->role === 'hospital_admin'
                && $request->user()->status === 'rejected'
                && $request->user()->hospital?->status === 'rejected',
            403,
            'Only the rejected hospital administrator can use this action.'
        );
    }

    private function ensureRestrictedHospitalAdmin(
        Request $request,
        HospitalLifecycleService $lifecycle
    ): void {
        abort_unless(
            $lifecycle->canAdminViewRestrictedStatus($request->user()),
            403,
            'This account cannot view restricted hospital status information.'
        );
    }
}
