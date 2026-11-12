<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incubator_units', function (Blueprint $table) {
            $table->decimal('price', 10, 2)->nullable()->after('available_capacity');
        });
    }

    public function down(): void
    {
        Schema::table('incubator_units', function (Blueprint $table) {
            $table->dropColumn('price');
        });
    }
};
