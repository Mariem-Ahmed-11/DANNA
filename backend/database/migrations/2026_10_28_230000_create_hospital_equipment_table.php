<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hospital_equipment', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hospital_id')->constrained()->cascadeOnDelete();
            $table->foreignId('incubator_unit_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->unsignedInteger('quantity');
            $table->string('tracking_mode', 32);
            $table->string('asset_label')->nullable();
            $table->string('operational_status', 32);
            $table->string('availability_status', 32);
            $table->text('notes')->nullable();
            $table->timestamp('availability_reported_at')->nullable();
            $table->timestamps();

            $table->index(['hospital_id', 'name']);
            $table->index(['incubator_unit_id', 'tracking_mode']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hospital_equipment');
    }
};
