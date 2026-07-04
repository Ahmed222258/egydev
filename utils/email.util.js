const nodemailer = require('nodemailer');
const logger = require('./logger.util');

// Create a transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send an OTP verification email to the user
 * @param {string} email 
 * @param {string} otp 
 */
const sendOtpEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || '"Ecommerce Support" <no-reply@ecommerce.com>',
    to: email,
    subject: 'Your 2FA Verification Code - Expires in 5 Minutes',
    text: `Hello,\n\nWe received a login request for your account. Please use the following 6-digit One-Time Password (OTP) to complete your login. This code is valid for 5 minutes.\n\nVerification Code: ${otp}\n\nIf you did not initiate this request, please secure your account immediately or contact support.\n\nThis is an automated message. Please do not reply to this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333333; text-align: center;">Security Verification</h2>
        <p>Hello,</p>
        <p>We received a login request for your account. Please use the following 6-digit One-Time Password (OTP) to complete your login. This code is valid for <strong>5 minutes</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4F46E5; background-color: #F3F4F6; padding: 10px 20px; border-radius: 5px; display: inline-block;">${otp}</span>
        </div>
        <p>If you did not initiate this request, please secure your account immediately or contact support.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">This is an automated message. Please do not reply to this email.</p>
      </div>
    `,
  };

  // Check if SMTP is configured. If not, log to console/logger as development fallback
  const isSmtpConfigured = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;

  if (!isSmtpConfigured) {
    logger.warn(`SMTP is not fully configured. Falling back to logging OTP for: ${email}`);
    logger.info(`[DEVELOPMENT OTP BYPASS] Verification code for ${email} is: ${otp}`);
    return {
      message: 'OTP logged to console (SMTP not configured)',
      otp,
    };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`OTP email successfully sent to ${email}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Failed to send OTP email to ${email}`, error);
    // Even if sending fails, we can log the OTP in non-production for debugging
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[FALLBACK LOG due to error] OTP for ${email} is: ${otp}`);
    }
    throw error;
  }
};

module.exports = {
  sendOtpEmail,
};
