import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../model/user.model.js';
import { sendOtpEmail } from '../utils/email.util.js';
import logger from '../utils/logger.util.js';

// Egyptian phone: +201XXXXXXXXX, 201XXXXXXXXX, or 01XXXXXXXXX (prefixes 010, 011, 012, 015)
const EGYPTIAN_PHONE_REGEX = /^(\+?20)?1[0125][0-9]{8}$/;

export const createUser = (role) => {
  return async (c) => {
    try {
      const { name, email, password, phone } = await c.req.json().catch(() => ({}));

      // Validate Egyptian phone number if provided
      if (phone && !EGYPTIAN_PHONE_REGEX.test(phone)) {
        return c.json({ message: 'Please enter a valid Egyptian phone number (e.g. 01012345678 or +201012345678)' }, 400);
      }

      if (!['admin', 'user'].includes(role)) {
        return c.json({ message: 'Invalid role' }, 400);
      }

      const existing = await User.findOne({ email });
      if (existing) {
        return c.json({ message: 'Email already exists' }, 400);
      }

      // Generate 6-digit secure OTP
      const otp = crypto.randomInt(100000, 1000000).toString();
      const otpHash = await bcrypt.hash(otp, 10);

      const user = await User.create({ 
        name, 
        email, 
        password, 
        phone,
        role,
        otpHash,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        otpAttempts: 0,
        otpResentAt: new Date(),
        isVerified: false
      });

      // Send Email
      try {
        await sendOtpEmail(user.email, otp, c.env);
      } catch (mailError) {
        logger.error(`Error sending email in signup: ${mailError.message}`);
      }

      return c.json({ 
        message: 'User created. OTP sent to email. Please verify.', 
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role,
          isVerified: user.isVerified
        } 
      }, 201);
    } catch (err) {
      logger.error(`createUser error: ${err.message}`);
      return c.json({ message: 'Server error' }, 500);
    }
  };
};

export const getUsers = async (c) => {
  try {
    // Exclude password hash from all user list responses
    const users = await User.find().select('-password');
    return c.json({ message: 'List of users', data: users }, 200);
  } catch (err) {
    logger.error(`getUsers error: ${err.message}`);
    return c.json({ message: 'Server error' }, 500);
  }
};

export const getProfile = async (c) => {
  try {
    const userContext = c.get('user');
    const user = await User.findById(userContext._id || userContext.id).select('-password'); // remove password from response
    if (!user) {
      return c.json({ message: 'User not found' }, 404);
    }
    return c.json({ data: user }, 200);
  } catch (err) {
    logger.error(`getProfile error: ${err.message}`);
    return c.json({ message: 'Server error' }, 500);
  }
};

export const updateUser = async (c) => {
  try {
    const userContext = c.get('user');
    const userId = userContext._id || userContext.id;
    const { name, email, password, phone } = await c.req.json().catch(() => ({}));

    // Validate Egyptian phone number if provided
    if (phone && !EGYPTIAN_PHONE_REGEX.test(phone)) {
      return c.json({ message: 'Please enter a valid Egyptian phone number (e.g. 01012345678 or +201012345678)' }, 400);
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select('-password'); 

    if (!updatedUser) {
      return c.json({ message: 'User not found' }, 404);
    }

    return c.json({ message: 'Profile updated', data: updatedUser }, 200);
  } catch (err) {
    logger.error(`updateUser error: ${err.message}`);
    return c.json({ message: 'Server error' }, 500);
  }
};
