<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MedicalService extends Model
{
    protected $fillable = [
        'name',
        'category',
        'short_description',
        'detailed_description',
        'service_status',
        'operating_hours',
        'notes',
    ];

    public function hospital(): BelongsTo
    {
        return $this->belongsTo(Hospital::class);
    }
}
