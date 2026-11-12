<?php

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;

uses(RefreshDatabase::class);

function spaOrigin(): array
{
    return ['Origin' => 'http://127.0.0.1:5173'];
}

test('a valid user can log in and receive only public user fields', function () {
    $user = User::factory()->create([
        'password' => 'correct-horse-battery-staple',
    ]);

    $response = $this->withHeaders(spaOrigin())
        ->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-horse-battery-staple',
        ])
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonPath('user.email', $user->email)
        ->assertJsonPath('user.role', 'super_admin')
        ->assertJsonPath('user.status', 'active')
        ->assertJsonMissingPath('user.password')
        ->assertJsonMissingPath('user.remember_token')
        ->assertJsonMissingPath('user.session_id');

    expect($response->headers->has('Set-Cookie'))->toBeTrue();
});

test('invalid credentials are rejected without authenticating the user', function () {
    $user = User::factory()->create([
        'password' => 'correct-horse-battery-staple',
    ]);

    $this->withHeaders(spaOrigin())
        ->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'incorrect-password',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);

    $this->getJson('/api/user')->assertUnauthorized();
});

test('login validates malformed input', function () {
    $this->withHeaders(spaOrigin())
        ->postJson('/api/login', [
            'email' => 'not-an-email',
            'password' => '',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email', 'password']);
});

test('login attempts are rate limited', function () {
    foreach (range(1, 5) as $attempt) {
        $this->withHeaders(spaOrigin())
            ->postJson('/api/login', [
                'email' => 'rate-limit-check@example.invalid',
                'password' => 'incorrect-password',
            ])
            ->assertUnprocessable();
    }

    $this->withHeaders(spaOrigin())
        ->postJson('/api/login', [
            'email' => 'rate-limit-check@example.invalid',
            'password' => 'incorrect-password',
        ])
        ->assertTooManyRequests();
});

test('the default seeder does not create a preconfigured account', function () {
    $this->seed(DatabaseSeeder::class);

    $this->assertDatabaseCount('users', 0);
});

test('administrator creation is registered under the DHANA command name', function () {
    expect(Artisan::all())->toHaveKey('dhana:create-admin');
});

test('authenticated users can access their account and log out', function () {
    $user = User::factory()->create([
        'password' => 'correct-horse-battery-staple',
    ]);

    $this->withHeaders(spaOrigin())
        ->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-horse-battery-staple',
        ])
        ->assertOk();

    $this->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonMissingPath('user.password');

    $this->withHeaders(spaOrigin())
        ->postJson('/api/logout')
        ->assertOk()
        ->assertJsonPath('message', 'You have been signed out.');

    expect(Auth::guard('web')->guest())->toBeTrue();
    Auth::forgetGuards();

    $this->withHeaders(spaOrigin())
        ->getJson('/api/user')
        ->assertUnauthorized();
});

test('protected administrative endpoints reject unauthenticated requests', function () {
    $this->getJson('/api/user')->assertUnauthorized();
    $this->getJson('/api/hospitals')->assertUnauthorized();
    $this->postJson('/api/hospitals', [
        'name' => 'Protected Facility',
        'city' => 'Example City',
    ])->assertUnprocessable();
});

test('unauthenticated API requests return JSON errors without requiring an Accept header', function () {
    $response = $this->call('GET', '/api/user', [], [], [], [
        'HTTP_ACCEPT' => 'text/html',
    ]);

    $response->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/json');
});

test('the SPA origin can make credentialed CORS requests and request the CSRF cookie', function () {
    foreach (['POST', 'PATCH', 'DELETE'] as $method) {
        $this->withHeaders([
            ...spaOrigin(),
            'Access-Control-Request-Method' => $method,
            'Access-Control-Request-Headers' => 'content-type,x-xsrf-token',
        ])->options('/api/hospital/incubator-units/1')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true')
            ->assertHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }

    $this->withHeaders(spaOrigin())
        ->get('/sanctum/csrf-cookie')
        ->assertNoContent()
        ->assertHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173')
        ->assertHeader('Access-Control-Allow-Credentials', 'true');
});
