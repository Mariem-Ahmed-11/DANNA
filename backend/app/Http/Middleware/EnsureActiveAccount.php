<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'This account is not active.'], 403);
        }

        $user->refresh();

        if ($user->status !== 'active') {
            return response()->json(['message' => 'This account is not active.'], 403);
        }

        if ($user->role === 'super_admin') {
            return $next($request);
        }

        if (! in_array($user->role, ['hospital_admin', 'hospital_staff'], true)
            || ! $user->hospital_id
            || $user->hospital?->status !== 'approved') {
            return response()->json(['message' => 'This account is not authorized.'], 403);
        }

        return $next($request);
    }
}
