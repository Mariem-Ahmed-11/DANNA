<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataReviewSubmission extends Model
{
    protected $fillable = [
        'hospital_id',
        'target_type',
        'target_id',
        'status',
        'snapshot',
        'snapshot_hash',
        'submitted_by',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    public function hospital(): BelongsTo
    {
        return $this->belongsTo(Hospital::class);
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
