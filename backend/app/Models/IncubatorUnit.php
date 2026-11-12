<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IncubatorUnit extends Model
{
    protected $fillable = [
        'name',
        'total_capacity',
        'available_capacity',
        'price',
        'availability_updated_at',
    ];

    protected function casts(): array
    {
        return [
            'total_capacity' => 'integer',
            'available_capacity' => 'integer',
            'price' => 'decimal:2',
            'availability_updated_at' => 'datetime',
        ];
    }

    public function hospital(): BelongsTo
    {
        return $this->belongsTo(Hospital::class);
    }

    public function equipment(): HasMany
    {
        return $this->hasMany(HospitalEquipment::class);
    }
}
