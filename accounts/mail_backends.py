"""Readable development email output, without MIME transfer encoding."""
from django.core.mail.backends.console import EmailBackend as ConsoleEmailBackend


class ReadableConsoleEmailBackend(ConsoleEmailBackend):
    def write_message(self, message):
        # Django's regular console backend serializes MIME. Quoted-printable
        # encoding can replace '=' with '=3D' and split URLs with soft newlines.
        # Display the original text so copied account links retain their keys.
        self.stream.write(f'To: {", ".join(message.to)}\n')
        self.stream.write(f'Subject: {message.subject}\n\n')
        self.stream.write(message.body)
        self.stream.write('\n' + '-' * 79 + '\n')
