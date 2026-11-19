const html = String.raw\`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Payment verification | DCDS Development</title>
<style>
:root{color-scheme:light;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f3fb;color:#28183a}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
main{width:min(100%,560px);padding:32px;border-radius:20px;background:white;box-shadow:0 14px 48px rgba(49,25,72,.10);text-align:center}
.logo{font-weight:900;letter-spacing:.22em;color:#6b35a2;font-size:14px}
h1{font-size:clamp(24px,5vw,32px);margin:22px 0 10px}
p{line-height:1.7;color:#5e5369}
.notice{margin-top:20px;padding:14px;border-radius:12px;background:#f2eafb;color:#4d2b70;font-size:14px}
a{display:inline-block;margin-top:22px;color:#6b35a2;font-weight:700;text-decoration:none}
small{display:block;margin-top:26px;color:#766b80}
</style>
</head>
<body>
<main>
<div class="logo">DE CHAMPIONS DIGITAL SERVICE</div>
<h1>We received your payment return</h1>
<p>DCDS is checking the transaction directly with Flutterwave. Your course access is updated only after the server confirms the payment reference, amount, currency and transaction status.</p>
<div class="notice"><strong>Do not pay again.</strong><br>This return page is not proof of payment. Sign in to your Development test account and refresh your course access after verification.</div>
<a href="https://dcds-dev-auth-preview.pages.dev/payment-sandbox.html">Return to DCDS sandbox</a>
<small>Development environment · NGN sandbox testing only</small>
</main>
</body>
</html>\`;

Deno.serve((req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { "Allow": "GET, HEAD" } });
  }
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
  return new Response(req.method === "HEAD" ? null : html, { status: 200, headers });
});
