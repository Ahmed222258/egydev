const express = require('express');
const router = express.Router();
const auth = require('../controller/auth.controller');

router.post('/login',auth.login);
router.post('/verify-otp', auth.verifyOtp);
router.post('/resend-otp', auth.resendOtp);
router.post('/forgot-password', auth.forgotPassword);
router.patch('/reset-password/:token', auth.resetPassword);

module.exports = router;