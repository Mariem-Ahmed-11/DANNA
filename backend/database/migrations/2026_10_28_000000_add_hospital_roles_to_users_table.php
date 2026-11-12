<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'hospital_staff'");
            DB::statement("ALTER TABLE users ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'suspended'");
            DB::statement('ALTER TABLE users ADD COLUMN hospital_id INTEGER NULL REFERENCES hospitals(id) ON DELETE SET NULL');

            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 32)->default('hospital_staff');
            $table->string('status', 32)->default('suspended');
            $table->foreignId('hospital_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('ALTER TABLE users DROP COLUMN hospital_id');
            DB::statement('ALTER TABLE users DROP COLUMN status');
            DB::statement('ALTER TABLE users DROP COLUMN role');

            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('hospital_id');
            $table->dropColumn(['role', 'status']);
        });
    }
};
