import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../model/user.model.js';
import jwt from 'jsonwebtoken';
import { sendOtpEmail, sendPasswordResetEmail } from '../utils/email.util.js';
import logger from '../utils/logger.util.js';
import { setCookie, deleteCookie } from 'hono/cookie';

const signToken = (user, env) => {
  return jwt.sign(
    { id: user._id, role: user.role, name: user.name },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN || '1d' }
  );
};

export const login = async (c) => {
  try {
    const { email, password } = await c.req.json().catch(() => ({}));
    if (!email || !password) {
      return c.json({ message: 'Email and password are required' }, 400);
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.correctPassword(password))) {
      return c.json({ message: 'Email or Password invalid' }, 400);
    }

    if (!user.isVerified) {
      return c.json({ message: 'Please verify your email address before logging in.' }, 403);
    }

    const token = signToken(user, c.env);
    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: c.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return c.json({ message: 'you are logedin' }, 200);
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    return c.json({ message: 'An unexpected error occurred during login' }, 500);
  }
};

export const verifyOtp = async (c) => {
  try {
    const { email, otp } = await c.req.json().catch(() => ({}));
    if (!email || !otp) {
      return c.json({ message: 'Email and OTP are required' }, 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return c.json({ message: 'User not found' }, 400);
    }

    // Check if there is an active OTP session
    if (!user.otpHash || !user.otpExpiresAt) {
      return c.json({ message: 'No active OTP verification session found' }, 400);
    }

    // Check attempts
    if (user.otpAttempts >= 5) {
      return c.json({ message: 'Too many verification attempts. Please request a new OTP.' }, 400);
    }

    // Check expiry
    if (Date.now() > user.otpExpiresAt.getTime()) {
      return c.json({ message: 'OTP has expired. Please request a new one.' }, 400);
    }

    // Compare OTP
    const isMatch = await bcrypt.compare(otp, user.otpHash);
    if (!isMatch) {
      user.otpAttempts += 1;
      await user.save();

      const remaining = 5 - user.otpAttempts;
      return c.json({ 
        message: `Invalid OTP code. ${remaining} attempts remaining.` 
      }, 400);
    }

    // Clear OTP fields upon successful verification and set isVerified
    user.isVerified = true;
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    user.otpResentAt = null;
    await user.save();

    // Generate JWT token
    const token = signToken(user, c.env);
    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: c.env.NODE_ENV === 'production',
      sameSite: c.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return c.json({
      message: 'you are logedin',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    }, 200);
  } catch (error) {
    logger.error(`OTP verification error: ${error.message}`);
    return c.json({ message: 'An unexpected error occurred during verification' }, 500);
  }
};

export const resendOtp = async (c) => {
  try {
    const { email } = await c.req.json().catch(() => ({}));
    if (!email) {
      return c.json({ message: 'Email is required' }, 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return c.json({ message: 'User not found' }, 400);
    }

    // Check 60-second cooldown
    if (user.otpResentAt && (Date.now() - user.otpResentAt.getTime() < 60 * 1000)) {
      const timeRemaining = Math.ceil((60 * 1000 - (Date.now() - user.otpResentAt.getTime())) / 1000);
      return c.json({ 
        message: `Please wait ${timeRemaining} seconds before requesting another OTP.` 
      }, 400);
    }

    // Generate 6-digit secure OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    user.otpHash = otpHash;
    user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    user.otpAttempts = 0;
    user.otpResentAt = new Date();
    await user.save();

    // Send Email
    try {
      await sendOtpEmail(user.email, otp, c.env);
    } catch (mailError) {
      logger.error(`Error sending email in resendOtp: ${mailError.message}`);
    }

    return c.json({ message: 'OTP resent successfully' }, 200);
  } catch (error) {
    logger.error(`OTP resend error: ${error.message}`);
    return c.json({ message: 'An unexpected error occurred during OTP resending' }, 500);
  }
};

export const forgotPassword = async (c) => {
  try {
    const { email } = await c.req.json().catch(() => ({}));
    if (!email) {
      return c.json({ message: 'Email is required' }, 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Generic response for security to prevent email enumeration
      return c.json({ message: 'If that email exists in our system, a password reset link has been sent.' }, 200);
    }

    // Generate the random token (unhashed) and save the hashed version to DB
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false }); // Skip validation for password 

    // Create reset URL
    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl, c.env);
      return c.json({ message: 'If that email exists in our system, a password reset link has been sent.' }, 200);
    } catch (mailError) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      logger.error(`Error sending email in forgotPassword: ${mailError.message}`);
      return c.json({ message: 'There was an error sending the email. Try again later.' }, 500);
    }
  } catch (error) {
    logger.error(`Forgot password error: ${error.message}`);
    return c.json({ message: 'An unexpected error occurred.' }, 500);
  }
};

export const resetPassword = async (c) => {
  try {
    const token = c.req.param('token');
    const { password } = await c.req.json().catch(() => ({}));

    if (!password) {
      return c.json({ message: 'New password is required.' }, 400);
    }

    // 1. Get user based on the hashed token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    // 2. If token has not expired, and there is user, set the new password
    if (!user) {
      return c.json({ message: 'Token is invalid or has expired.' }, 400);
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return c.json({ message: 'Password has been reset successfully. Please log in with your new password.' }, 200);

  } catch (error) {
    logger.error(`Reset password error: ${error.message}`);
    return c.json({ message: 'An unexpected error occurred.' }, 500);
  }
};

export const logout = (c) => {
  deleteCookie(c, 'token', {
    httpOnly: true,
    secure: c.env.NODE_ENV === 'production',
    sameSite: c.env.NODE_ENV === 'production' ? 'None' : 'Lax'
  });
  return c.json({ message: 'Logged out successfully' }, 200);
};