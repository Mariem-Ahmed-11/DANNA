<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\HospitalLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::guard('web')->attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials do not match our records.'],
            ]);
        }

        $user = $request->user('web');
        $restrictedAdminAccess = app(HospitalLifecycleService::class)
            ->canAdminViewRestrictedStatus($user);

        if (($user->status !== 'active' && ! $restrictedAdminAccess)
            || ($user->role !== 'super_admin'
                && (! $user->hospital_id
                    || ($user->hospital?->status !== 'approved' && ! $restrictedAdminAccess)))) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json([
                'message' => match ($user->status) {
                    'pending' => 'Your hospital account is awaiting approval.',
                    'rejected' => 'Your hospital registration was not approved.',
                    'suspended' => 'Your account is suspended. Contact DHANA support.',
                    default => 'Your account is not authorized to sign in.',
                },
            ], 403);
        }

        $request->session()->regenerate();

        return response()->json([
            'user' => $this->publicUser($user),
        ]);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->publicUser($request->user()->load('hospital:id,name,status,logo_path')),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'You have been signed out.',
        ]);
    }

    private function publicUser(User $user): array
    {
        return [
            ...$user->only(['id', 'name', 'email', 'role', 'status', 'hospital_id']),
            'hospital' => $user->hospital
                ? [
                    ...$user->hospital->only(['id', 'name', 'status']),
                    'logo_url' => $user->hospital->logo_path
                        ? Storage::disk('public')->url($user->hospital->logo_path)
                        : null,
                ]
                : null,
        ];
    }
}
