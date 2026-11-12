<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HospitalEquipment extends Model
{
    protected $table = 'hospital_equipment';

    protected $fillable = [
        'incubator_unit_id',
        'name',
        'quantity',
        'tracking_mode',
        'asset_label',
        'operational_status',
        'availability_status',
        'notes',
        'availability_reported_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'availability_reported_at' => 'datetime',
        ];
    }

    public function hospital(): BelongsTo
    {
        return $this->belongsTo(Hospital::class);
    }

    public function incubatorUnit(): BelongsTo
    {
        return $this->belongsTo(IncubatorUnit::class);
    }
}
