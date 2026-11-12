<!DOCTYPE html>
<html lang="en">
<body>
    <h1>You are invited to join {{ $hospitalName }} on DANNA</h1>
    <p>Hello {{ $inviteeName }},</p>
    <p>{{ $inviterName }} invited you to join the hospital team as a staff member.</p>
    <p><a href="{{ $invitationUrl }}">Accept invitation and set your password</a></p>
    <p>This single-use link expires in {{ $expiresInMinutes }} minutes. If you were not expecting this invitation, you can ignore this email.</p>
</body>
</html>
