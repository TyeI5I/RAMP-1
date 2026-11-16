import 'dotenv/config';

const appUrl = process.env.APP_URL;
const cronSecret = process.env.CRON_SECRET;

if (!appUrl || !cronSecret) {
  throw new Error('APP_URL and CRON_SECRET are required to run the lifecycle job.');
}

const response = await fetch(new URL('/api/jobs/lifecycle', appUrl), {
  method: 'POST',
  headers: { Authorization: `Bearer ${cronSecret}` },
});
const responseBody = await response.text();

if (!response.ok) {
  throw new Error(`Lifecycle job failed with HTTP ${response.status}: ${responseBody}`);
}

console.log(`Lifecycle job completed: ${responseBody}`);
