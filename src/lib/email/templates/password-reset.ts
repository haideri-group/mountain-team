export function passwordResetEmail(input: {
  recipientName: string | null;
  resetUrl: string;
  expiryMinutes: number;
}): { subject: string; html: string; text: string } {
  const { recipientName, resetUrl, expiryMinutes } = input;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const subject = "Reset your TeamFlow password";

  const text = [
    greeting,
    "",
    "We received a request to reset the password on your TeamFlow account.",
    "Use the link below to choose a new password. The link expires in " + expiryMinutes + " minutes and can only be used once.",
    "",
    resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email — your password won't change.",
    "",
    "— TeamFlow",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#fbf9f8;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1b1c1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fbf9f8;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(26,26,46,0.04);">
          <tr>
            <td style="background-color:#1a1a2e;padding:32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#ff8400;width:40px;height:40px;border-radius:8px;text-align:center;vertical-align:middle;">
                    <span style="color:#ffffff;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:18px;letter-spacing:-0.02em;">TF</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="color:#fbf9f8;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:20px;letter-spacing:-0.02em;">TEAMFLOW</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 24px 0;font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#1b1c1c;">Reset your password</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#1b1c1c;">${greeting}</p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#1b1c1c;">
                We received a request to reset the password on your TeamFlow account. Click the button below to choose a new one.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="background-color:#1a1a2e;border-radius:8px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#ffffff;text-decoration:none;">Reset password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#7c7268;">
                This link expires in ${expiryMinutes} minutes and can only be used once.
              </p>
              <p style="margin:0 0 24px 0;font-size:13px;line-height:20px;color:#7c7268;">
                Button not working? Paste this URL into your browser:
              </p>
              <p style="margin:0 0 32px 0;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:18px;color:#944a00;word-break:break-all;">
                <a href="${resetUrl}" style="color:#944a00;text-decoration:underline;">${resetUrl}</a>
              </p>
              <div style="height:1px;background-color:#dec1af;opacity:0.3;margin:24px 0;"></div>
              <p style="margin:0;font-size:13px;line-height:20px;color:#7c7268;">
                Didn't request this? You can safely ignore this email — your password won't change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f5f3f3;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.3em;color:#7c7268;">
                Crafted with <span style="color:#ff8400;">&hearts;</span> by Haider &middot; Mountain Tech
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
