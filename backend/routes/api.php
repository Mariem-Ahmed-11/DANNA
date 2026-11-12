<?php

use App\Http\Controllers\Api\AdminAnalyticsController;
use App\Http\Controllers\Api\AdminAuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DataReviewController;
use App\Http\Controllers\Api\HospitalController;
use App\Http\Controllers\Api\HospitalEquipmentController;
use App\Http\Controllers\Api\HospitalLifecycleController;
use App\Http\Controllers\Api\HospitalStaffController;
use App\Http\Controllers\Api\HospitalWorkspaceController;
use App\Http\Controllers\Api\IncubatorUnitController;
use App\Http\Controllers\Api\MedicalServiceController;
use App\Http\Controllers\Api\PasswordController;
use App\Http\Controllers\Api\UserAccountStatusController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/forgot-password', [PasswordController::class, 'forgot'])->middleware('throttle:password-forgot');
Route::post('/reset-password', [PasswordController::class, 'reset'])->middleware('throttle:password-reset');
Route::post('/hospitals', [HospitalController::class, 'register'])->middleware('throttle:login');
Route::post('/staff-invitations/accept', [HospitalStaffController::class, 'acceptInvitation'])
    ->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::patch('/user/password', [PasswordController::class, 'change'])->middleware('account.active');
    Route::get('/hospital/lifecycle-status', [HospitalController::class, 'rejectedRegistrationStatus']);
    Route::get('/hospital/rejected-registration/profile', [HospitalController::class, 'rejectedRegistrationProfile']);
    Route::patch('/hospital/rejected-registration/profile', [HospitalController::class, 'updateRejectedRegistrationProfile']);
    Route::post('/hospital/rejected-registration/resubmit', [HospitalController::class, 'resubmitRejectedRegistration']);

    Route::middleware('account.active')->group(function () {
        Route::get('/hospitals', [HospitalController::class, 'index']);
        Route::get('/hospitals/{hospital}', [HospitalController::class, 'show']);
        Route::patch('/hospitals/{hospital}', [HospitalController::class, 'update']);

        Route::middleware('role.super_admin')->prefix('admin')->group(function () {
            Route::get('/analytics', AdminAnalyticsController::class);
            Route::get('/audit-logs', AdminAuditLogController::class);
            Route::get('/users', [UserAccountStatusController::class, 'index']);
            Route::get('/hospital-requests', [HospitalController::class, 'requests']);
            Route::post('/hospitals/{hospital}/approve', [HospitalController::class, 'approve']);
            Route::post('/hospitals/{hospital}/reject', [HospitalController::class, 'reject']);
            Route::post('/hospitals/{hospital}/suspend', [HospitalController::class, 'suspend']);
            Route::post('/hospitals/{hospital}/reactivate', [HospitalController::class, 'reactivate']);
            Route::get('/hospitals/{hospital}/accounts', [UserAccountStatusController::class, 'hospitalAccounts']);
            Route::get('/hospitals/{hospital}/users', [UserAccountStatusController::class, 'hospitalUsers']);
            Route::post('/hospitals/{hospital}/users/{user}/activate', [HospitalController::class, 'activateUser']);
            Route::get('/hospitals/{hospital}/lifecycle-history', [HospitalLifecycleController::class, 'history']);
            Route::get('/hospitals/{hospital}/user-status-history', [UserAccountStatusController::class, 'hospitalHistory']);
            Route::get('/data-reviews', [DataReviewController::class, 'adminIndex']);
            Route::get('/data-reviews/{submission}', [DataReviewController::class, 'adminShow']);
            Route::post('/data-reviews/{submission}/approve', [DataReviewController::class, 'approve']);
            Route::post('/data-reviews/{submission}/request-changes', [DataReviewController::class, 'requestChanges']);
        });

        Route::middleware('role.hospital')->prefix('hospital')->group(function () {
            Route::get('/workspace', HospitalWorkspaceController::class);
            Route::get('/data-reviews', [DataReviewController::class, 'hospitalIndex']);
            Route::post('/data-reviews/{type}/{recordId}', [DataReviewController::class, 'submit']);

            Route::get('/profile', [HospitalController::class, 'profile']);
            Route::patch('/profile', [HospitalController::class, 'updateProfile']);

            Route::get('/staff', [HospitalStaffController::class, 'index']);
            Route::post('/staff/invitations', [HospitalStaffController::class, 'invite']);
            Route::post('/staff/{staffId}/deactivate', [HospitalStaffController::class, 'deactivate']);
            Route::post('/staff/{staffId}/reactivate', [HospitalStaffController::class, 'reactivate']);

            Route::get('/equipment', [HospitalEquipmentController::class, 'index']);
            Route::post('/equipment', [HospitalEquipmentController::class, 'store']);
            Route::get('/equipment/{equipment}', [HospitalEquipmentController::class, 'show']);
            Route::patch('/equipment/{equipment}', [HospitalEquipmentController::class, 'update']);
            Route::delete('/equipment/{equipment}', [HospitalEquipmentController::class, 'destroy']);

            Route::get('/services', [MedicalServiceController::class, 'index']);
            Route::post('/services', [MedicalServiceController::class, 'store']);
            Route::get('/services/{medicalService}', [MedicalServiceController::class, 'show']);
            Route::patch('/services/{medicalService}', [MedicalServiceController::class, 'update']);
            Route::delete('/services/{medicalService}', [MedicalServiceController::class, 'destroy']);

            Route::get('/incubator-units', [IncubatorUnitController::class, 'index']);
            Route::get('/incubator-units/{incubatorUnit}', [IncubatorUnitController::class, 'show']);
            Route::post('/incubator-units', [IncubatorUnitController::class, 'store']);
            Route::patch('/incubator-units/{incubatorUnit}', [IncubatorUnitController::class, 'update']);
            Route::delete('/incubator-units/{incubatorUnit}', [IncubatorUnitController::class, 'destroy']);
        });
    });
});
