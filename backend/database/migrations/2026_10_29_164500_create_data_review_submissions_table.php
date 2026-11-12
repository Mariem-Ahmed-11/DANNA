<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_review_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hospital_id')->constrained()->cascadeOnDelete();
            $table->string('target_type', 64);
            $table->unsignedBigInteger('target_id');
            $table->string('status', 40)->default('pending_review');
            $table->json('snapshot');
            $table->char('snapshot_hash', 64);
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('feedback')->nullable();
            $table->timestamps();

            $table->index(['hospital_id', 'target_type', 'target_id', 'submitted_at'], 'data_review_target_history_idx');
            $table->index(['status', 'submitted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_review_submissions');
    }
};
