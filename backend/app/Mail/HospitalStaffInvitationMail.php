<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class HospitalStaffInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $inviteeName,
        public string $hospitalName,
        public string $inviterName,
        public string $invitationUrl,
        public int $expiresInMinutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Invitation to join '.$this->hospitalName.' on DANNA',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.hospital-staff-invitation',
        );
    }
}
