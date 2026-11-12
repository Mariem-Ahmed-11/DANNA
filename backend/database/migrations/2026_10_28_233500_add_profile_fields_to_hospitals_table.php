<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hospitals', function (Blueprint $table) {
            $table->string('contact_email')->nullable();
            $table->string('governorate', 100)->nullable();
            $table->string('address', 1000)->nullable();
            $table->string('short_description', 500)->nullable();
            $table->text('overview')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('website_url', 2048)->nullable();
            $table->string('working_hours', 1000)->nullable();
            $table->unsignedSmallInteger('establishment_year')->nullable();
            $table->string('location_url', 2048)->nullable();
            $table->json('specialties')->nullable();
            $table->json('services')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('hospitals', function (Blueprint $table) {
            $table->dropColumn([
                'contact_email',
                'governorate',
                'address',
                'short_description',
                'overview',
                'logo_path',
                'website_url',
                'working_hours',
                'establishment_year',
                'location_url',
                'specialties',
                'services',
            ]);
        });
    }
};
