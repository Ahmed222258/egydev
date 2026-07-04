const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../model/user.model');
const jwt = require('jsonwebtoken');
const { sendOtpEmail, sendPasswordResetEmail } = require('../utils/email.util');
const logger = require('../utils/logger.util');

const signToken = (user)=>{
return jwt.sign(
    {id: user._id, role:user.role,name:user.name},
    process.env.JWT_SECRET,
    {expiresIn: process.env.JWT_EXPIRES_IN || '1d'}
)
}

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user || !(await user.correctPassword(password))) {
            return res.status(400).json({ message: 'Email or Password invalid' });
        }

        if (!user.isVerified) {
            return res.status(403).json({ message: 'Please verify your email address before logging in.' });
        }

        const token = signToken(user);
        return res.status(200).json({ message: 'you are logedin', token });
    } catch (error) {
        logger.error(`Login error: ${error.message}`);
        return res.status(500).json({ message: 'An unexpected error occurred during login' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Check if there is an active OTP session
        if (!user.otpHash || !user.otpExpiresAt) {
            return res.status(400).json({ message: 'No active OTP verification session found' });
        }

        // Check attempts
        if (user.otpAttempts >= 5) {
            return res.status(400).json({ message: 'Too many verification attempts. Please request a new OTP.' });
        }

        // Check expiry
        if (Date.now() > user.otpExpiresAt.getTime()) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        // Compare OTP
        const isMatch = await bcrypt.compare(otp, user.otpHash);
        if (!isMatch) {
            user.otpAttempts += 1;
            await user.save();

            const remaining = 5 - user.otpAttempts;
            return res.status(400).json({ 
                message: `Invalid OTP code. ${remaining} attempts remaining.` 
            });
        }

        // Clear OTP fields upon successful verification and set isVerified
        user.isVerified = true;
        user.otpHash = null;
        user.otpExpiresAt = null;
        user.otpAttempts = 0;
        user.otpResentAt = null;
        await user.save();

        // Generate JWT token
        const token = signToken(user);
        return res.status(200).json({
            message: 'you are logedin',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        logger.error(`OTP verification error: ${error.message}`);
        return res.status(500).json({ message: 'An unexpected error occurred during verification' });
    }
};

exports.resendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Check 60-second cooldown
        if (user.otpResentAt && (Date.now() - user.otpResentAt.getTime() < 60 * 1000)) {
            const timeRemaining = Math.ceil((60 * 1000 - (Date.now() - user.otpResentAt.getTime())) / 1000);
            return res.status(400).json({ 
                message: `Please wait ${timeRemaining} seconds before requesting another OTP.` 
            });
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
            await sendOtpEmail(user.email, otp);
        } catch (mailError) {
            logger.error(`Error sending email in resendOtp: ${mailError.message}`);
        }

        return res.status(200).json({ message: 'OTP resent successfully' });
    } catch (error) {
        logger.error(`OTP resend error: ${error.message}`);
        return res.status(500).json({ message: 'An unexpected error occurred during OTP resending' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            // Generic response for security to prevent email enumeration
            return res.status(200).json({ message: 'If that email exists in our system, a password reset link has been sent.' });
        }

        // Generate the random token (unhashed) and save the hashed version to DB
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false }); // Skip validation for password 

        // Create reset URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

        try {
            await sendPasswordResetEmail(user.email, resetUrl);
            return res.status(200).json({ message: 'If that email exists in our system, a password reset link has been sent.' });
        } catch (mailError) {
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });
            logger.error(`Error sending email in forgotPassword: ${mailError.message}`);
            return res.status(500).json({ message: 'There was an error sending the email. Try again later.' });
        }
    } catch (error) {
        logger.error(`Forgot password error: ${error.message}`);
        return res.status(500).json({ message: 'An unexpected error occurred.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ message: 'New password is required.' });
        }

        // 1. Get user based on the hashed token
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        // 2. If token has not expired, and there is user, set the new password
        if (!user) {
            return res.status(400).json({ message: 'Token is invalid or has expired.' });
        }

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        return res.status(200).json({ message: 'Password has been reset successfully. Please log in with your new password.' });

    } catch (error) {
        logger.error(`Reset password error: ${error.message}`);
        return res.status(500).json({ message: 'An unexpected error occurred.' });
    }
};