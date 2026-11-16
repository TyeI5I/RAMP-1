export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface ResendResponse {
  id?: string;
}

export async function sendTransactionalEmail(
  message: TransactionalEmail,
  idempotencyKey?: string
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error('Transactional email is not configured.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ ...message, from }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error(`Resend email request failed with HTTP ${response.status}.`);
    throw new Error(`Transactional email delivery failed (HTTP ${response.status}).`);
  }

  const result = (await response.json()) as ResendResponse;
  if (!result.id) {
    throw new Error('Resend returned an invalid email response.');
  }
  return result.id;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[character];
  });
}
