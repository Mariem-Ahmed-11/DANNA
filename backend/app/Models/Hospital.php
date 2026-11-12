<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Hospital extends Model
{
    protected $hidden = [
        'logo_path',
    ];

    protected $fillable = [
        'name',
        'city',
        'phone',
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
    ];

    protected function casts(): array
    {
        return [
            'establishment_year' => 'integer',
            'specialties' => 'array',
            'services' => 'array',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function staffInvitations(): HasMany
    {
        return $this->hasMany(HospitalStaffInvitation::class);
    }

    public function lifecycleEvents(): HasMany
    {
        return $this->hasMany(HospitalLifecycleEvent::class);
    }

    public function incubatorUnits(): HasMany
    {
        return $this->hasMany(IncubatorUnit::class);
    }

    public function equipment(): HasMany
    {
        return $this->hasMany(HospitalEquipment::class);
    }

    public function medicalServices(): HasMany
    {
        return $this->hasMany(MedicalService::class);
    }

    public function dataReviewSubmissions(): HasMany
    {
        return $this->hasMany(DataReviewSubmission::class);
    }

    public function userAccountStatusEvents(): HasMany
    {
        return $this->hasMany(UserAccountStatusEvent::class);
    }
}
