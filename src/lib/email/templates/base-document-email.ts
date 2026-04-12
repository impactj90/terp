/**
 * Base Document Email Template
 *
 * Wraps the resolved HTML body with responsive container,
 * tenant branding, and cross-client compatible inline styles.
 */

interface BaseEmailOptions {
  bodyHtml: string
  companyName?: string
  companyAddress?: string
}

export function renderBaseEmail(options: BaseEmailOptions): string {
  const { bodyHtml, companyName, companyAddress } = options

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${companyName ?? ""}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#333333;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:4px;">
          ${companyName ? `<tr>
            <td style="padding:24px 32px 0 32px;border-bottom:1px solid #eeeeee;">
              <p style="margin:0 0 16px 0;font-size:16px;font-weight:bold;color:#111111;">${companyName}</p>
            </td>
          </tr>` : ""}
          <tr>
            <td style="padding:24px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          ${companyAddress ? `<tr>
            <td style="padding:16px 32px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:12px;color:#888888;">${companyAddress}</p>
            </td>
          </tr>` : ""}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
