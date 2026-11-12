<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class CreateAdministrator extends Command
{
    protected $signature = 'dhana:create-admin';

    protected $description = 'Interactively create a DANNA administrator account';

    public function handle(): int
    {
        if (! $this->input->isInteractive()) {
            $this->error('Run this command from an interactive terminal.');

            return self::FAILURE;
        }

        $name = trim((string) $this->ask('Administrator name'));
        $email = mb_strtolower(trim((string) $this->ask('Administrator email')));

        $validator = Validator::make(
            compact('name', 'email'),
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            ]
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $password = $this->secret('Password (minimum 12 characters)');
        $confirmation = $this->secret('Confirm password');

        if (! is_string($password) || mb_strlen($password) < 12) {
            $this->error('The password must be at least 12 characters.');

            return self::FAILURE;
        }

        if (! is_string($confirmation) || ! hash_equals($password, $confirmation)) {
            $this->error('The password confirmation does not match.');

            return self::FAILURE;
        }

        $user = User::query()->create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
        ]);
        $user->forceFill([
            'role' => 'super_admin',
            'status' => 'active',
        ])->save();

        $this->info('Super Admin account created.');

        return self::SUCCESS;
    }
}
