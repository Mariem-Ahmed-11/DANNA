<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "CREATE UNIQUE INDEX IF NOT EXISTS data_review_pending_unique
            ON data_review_submissions (hospital_id, target_type, target_id)
            WHERE status = 'pending_review'"
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS data_review_pending_unique');
    }
};
