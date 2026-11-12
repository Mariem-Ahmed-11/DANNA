<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureHospitalUser
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! in_array($request->user()?->role, ['hospital_admin', 'hospital_staff'], true)) {
            return response()->json(['message' => 'This action is not authorized.'], 403);
        }

        return $next($request);
    }
}
