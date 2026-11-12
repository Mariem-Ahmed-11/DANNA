<?php

require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$user = App\Models\User::updateOrCreate(
    ['email' => 'visual-check@danna.test'],
    [
        'name' => 'Visual Check',
        'password' => 'VisualCheck123',
    ]
);

$user->forceFill([
    'role' => 'super_admin',
    'status' => 'active',
])->save();

echo $user->fresh()->id, ' ', $user->fresh()->role, ' ', $user->fresh()->status, PHP_EOL;
