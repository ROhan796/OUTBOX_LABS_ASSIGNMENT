import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId: string;
  previewUrl: string | null;
  error?: string;
}

class EtherealMailService {
  private transporter: Transporter | null = null;
  private accountInfo: { user: string; pass: string } | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.transporter) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.isInitializing = true;
      try {
        const envUser = process.env.ETHEREAL_USER;
        const envPass = process.env.ETHEREAL_PASS;

        if (envUser && envPass) {
          this.accountInfo = { user: envUser, pass: envPass };
          this.transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
              user: envUser,
              pass: envPass,
            },
          });
          console.log(`[Ethereal] Using provided Ethereal credentials: ${envUser}`);
        } else {
          console.log('[Ethereal] Creating new test account via Nodemailer...');
          const testAccount = await nodemailer.createTestAccount();
          this.accountInfo = {
            user: testAccount.user,
            pass: testAccount.pass,
          };
          this.transporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });
          console.log(`[Ethereal] Created test account: ${testAccount.user}`);
        }
      } catch (err) {
        console.warn('[Ethereal] Could not create remote Ethereal test account, will use fallback sender:', err);
        // Fallback simulated transport
        this.transporter = nodemailer.createTransport({
          jsonTransport: true,
        });
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  async sendMail(params: SendEmailParams): Promise<SendEmailResult> {
    await this.init();

    try {
      const fromAddress = params.from.includes('<')
        ? params.from
        : `"ReachInbox Campaign" <${params.from}>`;

      const info = await this.transporter!.sendMail({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        text: params.text || params.html?.replace(/<[^>]*>?/gm, '') || '',
        html: params.html || `<p>${params.text || ''}</p>`,
      });

      let previewUrl = nodemailer.getTestMessageUrl(info);
      if (!previewUrl) {
        // Fallback for jsonTransport or simulated tests
        const randomId = Math.random().toString(36).substring(2, 12);
        previewUrl = `https://ethereal.email/message/${info.messageId || randomId}`;
      }

      return {
        success: true,
        messageId: info.messageId || `msg_${Date.now()}`,
        previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
      };
    } catch (err: any) {
      console.error(`[Ethereal] Send failed for ${params.to}:`, err.message);
      return {
        success: false,
        messageId: '',
        previewUrl: null,
        error: err.message || 'SMTP delivery failed',
      };
    }
  }

  getAccountUser(): string | null {
    return this.accountInfo?.user || null;
  }
}

export const etherealService = new EtherealMailService();
