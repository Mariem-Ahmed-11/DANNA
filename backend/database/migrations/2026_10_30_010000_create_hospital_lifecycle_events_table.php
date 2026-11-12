<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hospital_lifecycle_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hospital_id')->constrained()->restrictOnDelete();
            $table->string('previous_status', 32)->nullable();
            $table->string('new_status', 32);
            $table->string('action', 32);
            $table->text('reason')->nullable();
            $table->unsignedBigInteger('actor_id')->nullable()->index();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['hospital_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hospital_lifecycle_events');
    }
};
