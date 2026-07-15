const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../model/user.model');
const { sendOtpEmail } = require('../utils/email.util');
const logger = require('../utils/logger.util');

// Egyptian phone: +201XXXXXXXXX, 201XXXXXXXXX, or 01XXXXXXXXX (prefixes 010, 011, 012, 015)
const EGYPTIAN_PHONE_REGEX = /^(\+?20)?1[0125][0-9]{8}$/;

exports.createUser = (role) => {
  return async (req, res) => {
    try {
      const { name, email, password, phone } = req.body;

      // Validate Egyptian phone number if provided
      if (phone && !EGYPTIAN_PHONE_REGEX.test(phone)) {
        return res.status(400).json({ message: 'Please enter a valid Egyptian phone number (e.g. 01012345678 or +201012345678)' });
      }

      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ message: 'Email already exists' });
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
          await sendOtpEmail(user.email, otp);
      } catch (mailError) {
          logger.error(`Error sending email in signup: ${mailError.message}`);
      }

      res.status(201).json({ 
          message: 'User created. OTP sent to email. Please verify.', 
          user: { 
              id: user._id, 
              name: user.name, 
              email: user.email, 
              role: user.role,
              isVerified: user.isVerified
          } 
      });
    } catch (err) {
      logger.error(`createUser error: ${err.message}`);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

exports.getUsers = async (req, res) => {
  try {
    // FIX #8: exclude password hash from all user list responses
    const users = await User.find().select('-password');
    res.status(200).json({ message: 'List of users', data: users });
  } catch (err) {
    logger.error(`getUsers error: ${err.message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password'); // remove password from response
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ data: user });
  } catch (err) {
    logger.error(`getProfile error: ${err.message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.user.id; 
    const { name, email, password, phone } = req.body;

    // Validate Egyptian phone number if provided
    if (phone && !EGYPTIAN_PHONE_REGEX.test(phone)) {
      return res.status(400).json({ message: 'Please enter a valid Egyptian phone number (e.g. 01012345678 or +201012345678)' });
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
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'Profile updated', data: updatedUser });
  } catch (err) {
    logger.error(`updateUser error: ${err.message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

