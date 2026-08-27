import nodemailer from "nodemailer";
import type { Transporter, SentMessageInfo } from "nodemailer";
import { ENV } from "../config/env.js";

/**
 * SMTP Transporter
 */
const transporter: Transporter = nodemailer.createTransport({
  host: ENV.EMAIL_HOST as string,
  port: Number(ENV.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true", // true for 465
  auth: {
    user: ENV.EMAIL_USER as string,
    pass: ENV.EMAIL_PASS as string,
  },
});

/**
 * Success response type
 */
interface SendEmailSuccess {
  success: true;
  message: string;
  messageId: string;
  accepted: readonly string[];
  rejected: readonly string[];
}

/**
 * Error response type
 */
interface SendEmailError {
  success: false;
  message: string;
  error: string;
  code?: string;
  response?: string;
}

type SendEmailResponse = SendEmailSuccess | SendEmailError;

/**
 * Send email with status
 */
export default async function sendEmail(
  email: string,
  subject: string,
  html: string,
): Promise<SendEmailResponse> {
  try {
    // 1️⃣ Verify SMTP connection
    await transporter.verify();

    // 2️⃣ Send email
    const info: SentMessageInfo = await transporter.sendMail({
      from: ENV.EMAIL_FROM || ENV.EMAIL_USER,
      to: email,
      subject,
      html,
    });

    return {
      success: true,
      message: "Email sent successfully",
      messageId: info.messageId as string,
      accepted: info.accepted ?? [],
      rejected: info.rejected ?? [],
    };
  } catch (error) {
    const err = error as Error & {
      code?: string;
      response?: string;
    };

    return {
      success: false,
      message: "Email sending failed",
      error: err.message,
      code: err.code || '500',
      response: err.response || err.message,
    };
  }
}
