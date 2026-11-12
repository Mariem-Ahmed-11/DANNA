<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_account_status_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('hospital_id')->constrained('hospitals')->restrictOnDelete();
            $table->unsignedBigInteger('actor_id')->nullable()->index();
            $table->string('previous_status', 32);
            $table->string('new_status', 32);
            $table->string('action', 32);
            $table->text('reason');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'created_at']);
            $table->index(['hospital_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_account_status_events');
    }
};
