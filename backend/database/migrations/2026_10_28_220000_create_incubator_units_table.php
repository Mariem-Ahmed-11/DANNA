<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incubator_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hospital_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedInteger('total_capacity');
            $table->unsignedInteger('available_capacity');
            $table->timestamp('availability_updated_at')->nullable();
            $table->timestamps();

            $table->index(['hospital_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incubator_units');
    }
};
