<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('medical_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hospital_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('category', 64);
            $table->string('short_description', 500);
            $table->text('detailed_description')->nullable();
            $table->string('service_status', 32)->default('not_confirmed');
            $table->string('operating_hours', 255)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['hospital_id', 'category']);
            $table->index(['hospital_id', 'service_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medical_services');
    }
};
